import type { DevframeNodeContext } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type {
  DevframeDockEntry,
  DevframeDocksHost as DevframeDocksHostType,
  DevframeDockUserEntry,
  DevframeViewIframe,
  RemoteConnectionInfo,
  RemoteDockOptions,
} from '../types/docks'
import type { DevframeDocksUserSettings } from '../types/settings'
import type { DevframeHubContext } from './context'
import { REMOTE_CONNECTION_KEY } from 'devframe/constants'
import { createStorage } from 'devframe/node'
import { getInternalContext } from 'devframe/node/hub-internals'
import { createEventEmitter } from 'devframe/utils/events'
import { join } from 'pathe'
import { DEFAULT_STATE_USER_SETTINGS } from '../constants'
import { diagnostics } from './diagnostics'

interface RemoteDockRecord {
  token: string
  options: Required<RemoteDockOptions>
}

function normaliseRemoteOptions(remote: true | RemoteDockOptions): Required<RemoteDockOptions> {
  const opts = remote === true ? {} : remote
  return {
    transport: opts.transport ?? 'fragment',
    originLock: opts.originLock ?? true,
  }
}

function base64UrlEncode(value: string): string {
  // URL-safe base64 without padding so the descriptor is compact and safe to
  // drop into a URL without escaping.
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function buildRemoteUrl(baseUrl: string, payload: RemoteConnectionInfo, transport: 'fragment' | 'query'): string {
  const encoded = base64UrlEncode(JSON.stringify(payload))
  const param = `${REMOTE_CONNECTION_KEY}=${encoded}`
  if (transport === 'fragment') {
    // Replace any existing fragment/query descriptor bearing our key; otherwise append.
    const hashIdx = baseUrl.indexOf('#')
    if (hashIdx === -1)
      return `${baseUrl}#${param}`
    const before = baseUrl.slice(0, hashIdx)
    const rawHash = baseUrl.slice(hashIdx + 1)
    if (!rawHash)
      return `${before}#${param}`
    const routeQueryIdx = rawHash.indexOf('?')
    if (routeQueryIdx !== -1) {
      const beforeQuery = rawHash.slice(0, routeQueryIdx + 1)
      const params = new URLSearchParams(rawHash.slice(routeQueryIdx + 1))
      params.set(REMOTE_CONNECTION_KEY, encoded)
      return `${before}#${beforeQuery}${params.toString()}`
    }

    const parts = rawHash.split('&')
    const existingIdx = parts.findIndex((part) => {
      const [key] = part.split('=')
      return key === REMOTE_CONNECTION_KEY
    })
    if (existingIdx >= 0) {
      parts[existingIdx] = param
      return `${before}#${parts.join('&')}`
    }
    return `${before}#${rawHash}&${param}`
  }
  // query
  const qIdx = baseUrl.indexOf('?')
  const hashIdx = baseUrl.indexOf('#')
  const hash = hashIdx === -1 ? '' : baseUrl.slice(hashIdx)
  const beforeHash = hashIdx === -1 ? baseUrl : baseUrl.slice(0, hashIdx)
  const sep = qIdx === -1 || qIdx >= (hashIdx === -1 ? beforeHash.length : hashIdx) ? '?' : '&'
  return `${beforeHash}${sep}${param}${hash}`
}

export class DevframeDocksHost implements DevframeDocksHostType {
  public readonly views: DevframeDocksHostType['views'] = new Map()
  public readonly events: DevframeDocksHostType['events'] = createEventEmitter()
  public userSettings: SharedState<DevframeDocksUserSettings> = undefined!

  /** Dock-id → allocated remote token + resolved options. */
  private readonly remoteDocks = new Map<string, RemoteDockRecord>()

  constructor(
    public readonly context: DevframeHubContext,
  ) {}

  async init() {
    this.userSettings = await this.context.rpc.sharedState.get('devframe:user-settings', {
      sharedState: createStorage({
        filepath: join(this.context.host.getStorageDir('workspace'), 'settings.json'),
        initialValue: DEFAULT_STATE_USER_SETTINGS(),
      }),
    })
  }

  values(): DevframeDockEntry[] {
    return Array.from(this.views.values(), view => this.projectView(view))
  }

  private projectView(view: DevframeDockUserEntry): DevframeDockUserEntry {
    if (view.type !== 'iframe' || !view.remote)
      return view
    const record = this.remoteDocks.get(view.id)
    const endpoint = getInternalContext(this.context as DevframeNodeContext).wsEndpoint
    if (!record || !endpoint)
      return view

    const payload: RemoteConnectionInfo = {
      v: 1,
      backend: 'websocket',
      websocket: endpoint.url,
      authToken: record.token,
      origin: this.resolveDevServerOrigin(),
    }
    return {
      ...view,
      url: buildRemoteUrl(view.url, payload, record.options.transport),
    } satisfies DevframeViewIframe
  }

  private resolveDevServerOrigin(): string {
    return this.context.host.resolveOrigin()
  }

  register<T extends DevframeDockUserEntry>(view: T, force?: boolean): {
    update: (patch: Partial<T>) => void
  } {
    if (this.views.has(view.id) && !force) {
      throw diagnostics.DF8100({ id: view.id })
    }
    this.validateGroupMembership(view)
    this.prepareRemoteRegistration(view)
    this.views.set(view.id, view)
    this.events.emit('dock:entry:updated', view)

    return {
      update: (patch) => {
        if (patch.id && patch.id !== view.id) {
          throw diagnostics.DF8101({ id: view.id, attempted: patch.id })
        }
        this.update(Object.assign(this.views.get(view.id)!, patch))
      },
    }
  }

  update(view: DevframeDockUserEntry): void {
    if (!this.views.has(view.id)) {
      throw diagnostics.DF8102({ id: view.id })
    }
    this.validateGroupMembership(view)
    this.prepareRemoteRegistration(view)
    this.views.set(view.id, view)
    this.events.emit('dock:entry:updated', view)
  }

  activate(dockId: string, params?: Record<string, unknown>): void {
    // Best-effort: warn (don't throw) when the target isn't a registered dock
    // so a typo is observable, but still emit — the client host and each dock
    // ignore ids they don't recognize, so a mis-addressed activation is inert
    // rather than fatal.
    if (!this.views.has(dockId))
      diagnostics.DF8107({ id: dockId })
    this.events.emit('dock:activate', { dockId, params })
  }

  private validateGroupMembership(view: DevframeDockUserEntry): void {
    if (view.groupId === undefined)
      return
    if (view.groupId === view.id)
      throw diagnostics.DF8103({ id: view.id })
    if (view.type === 'group')
      throw diagnostics.DF8104({ id: view.id })
  }

  private prepareRemoteRegistration(view: DevframeDockUserEntry): void {
    const internal = getInternalContext(this.context as DevframeNodeContext)
    // Always revoke any previously allocated token for this dock id — covers
    // force re-registration and update() paths.
    internal.revokeRemoteTokensForDock(view.id)
    this.remoteDocks.delete(view.id)

    if (view.type !== 'iframe' || !view.remote)
      return

    const options = normaliseRemoteOptions(view.remote)
    let dockOrigin: string
    try {
      dockOrigin = new URL(view.url).origin
    }
    catch {
      // Relative/invalid URL — origin-lock can't be enforced. Fall back to the
      // dev-server origin; this still works because the iframe loads in the
      // same browser anyway.
      dockOrigin = this.resolveDevServerOrigin()
    }
    const token = internal.allocateRemoteToken(view.id, dockOrigin, options.originLock)
    this.remoteDocks.set(view.id, { token, options })
  }
}
