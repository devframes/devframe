import type { DevframeNodeContext } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type {
  ClientScriptEntry,
  DevframeDockEntry,
  DevframeDocksHost as DevframeDocksHostType,
  DevframeDockUserEntry,
  DevframeViewIframe,
  RemoteConnectionInfo,
  RemoteDockOptions,
} from '../types/docks'
import type { DevframeDocksUserSettings } from '../types/settings'
import type { DevframeHubContext } from './context'
import { createStorage } from 'devframe/node'
import { getInternalContext } from 'devframe/node/hub-internals'
import { createEventEmitter } from 'devframe/utils/events'
import { join } from 'pathe'
import { isBareModuleSpecifier } from '../client-modules'
import { DEFAULT_STATE_USER_SETTINGS } from '../constants'
import { HUB_EVENTS } from '../events'
import { buildRemoteConnectionUrl } from '../remote-url'
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
    this.userSettings = await this.context.rpc.sharedState.get(HUB_EVENTS.sharedState.userSettings, {
      sharedState: createStorage({
        // Personal dock layout/preferences: per-checkout private state.
        filepath: join(this.context.host.getStorageDir('project'), 'settings.json'),
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
      url: buildRemoteConnectionUrl(view.url, payload, record.options.transport),
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
    this.warnUnresolvableClientScript(view)
    this.prepareRemoteRegistration(view)
    this.views.set(view.id, view)
    this.events.emit(HUB_EVENTS.bus.docksEntryUpdated, view)

    return {
      update: (patch) => {
        if (patch.id && patch.id !== view.id) {
          throw diagnostics.DF8101({ id: view.id, attempted: patch.id })
        }
        // Merge into a fresh object rather than mutating the stored entry in
        // place: once projected into the `devframe:docks` shared state, the
        // stored entry is deep-frozen by Immer, so an in-place `Object.assign`
        // would throw "Cannot assign to read only property". A new object is
        // always writable, and `update()` swaps it into the registry.
        this.update({ ...this.views.get(view.id)!, ...patch } as DevframeDockUserEntry)
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
    this.events.emit(HUB_EVENTS.bus.docksEntryUpdated, view)
  }

  activate(dockId: string, params?: Record<string, unknown>): void {
    // Best-effort: warn (don't throw) when the target isn't a registered dock
    // so a typo is observable, but still emit — the client host and each dock
    // ignore ids they don't recognize, so a mis-addressed activation is inert
    // rather than fatal.
    if (!this.views.has(dockId))
      diagnostics.DF8107({ id: dockId })
    this.events.emit(HUB_EVENTS.bus.docksActivate, { dockId, params })
  }

  /**
   * Warn (don't throw — a client-runtime `resolveClientModule` override may still cover
   * it) when a dock declares a **bare-specifier** client script on a host
   * that advertises no `staticConfig.dock.clientModuleResolution`: the
   * browser cannot resolve a bare npm specifier natively, so the script is
   * doomed to fail there.
   */
  private warnUnresolvableClientScript(view: DevframeDockUserEntry): void {
    if (this.context.staticConfig?.dock?.clientModuleResolution)
      return
    const script = (view as { clientScript?: ClientScriptEntry }).clientScript
      ?? (view as { action?: ClientScriptEntry }).action
      ?? (view as { renderer?: ClientScriptEntry }).renderer
    if (script?.importFrom && isBareModuleSpecifier(script.importFrom))
      diagnostics.DF8111({ id: view.id, specifier: script.importFrom })
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
