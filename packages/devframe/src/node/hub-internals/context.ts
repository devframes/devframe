import type { DevframeNodeContext } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import { randomToken } from 'devframe/utils/crypto-token'
import { join } from 'pathe'
import { revokeActiveConnectionsForToken, revokeAuthToken } from '../auth/revoke'
import { createStorage } from '../storage'

export interface InternalAnonymousAuthStorage {
  trusted: Record<string, {
    authToken: string
    ua: string
    origin: string
    timestamp: number
  } | undefined>
}

export interface RemoteTokenRecord {
  dockId: string
  /** Dock URL origin — matched against WS handshake `Origin` header when `originLock` is on. */
  origin: string
  originLock: boolean
}

export interface DevframeInternalContext {
  storage: {
    auth: SharedState<InternalAnonymousAuthStorage>
  }
  /**
   * Revoke an auth token: remove from storage and notify all connected clients
   * using this token that they are no longer trusted.
   */
  revokeAuthToken: (token: string) => Promise<void>

  /**
   * Session-only tokens issued to remote-UI iframe docks. Not persisted —
   * regenerated on every dev-server restart.
   */
  remoteTokens: Map<string, RemoteTokenRecord>
  allocateRemoteToken: (dockId: string, origin: string, originLock: boolean) => string
  revokeRemoteToken: (token: string) => void
  revokeRemoteTokensForDock: (dockId: string) => void
  /**
   * Returns true if `token` is a valid remote token and, when `originLock` is
   * on, `requestOrigin` matches the recorded dock origin.
   */
  isRemoteTokenTrusted: (token: string, requestOrigin?: string) => boolean

  /**
   * Populated by `createWsServer` once the WS port is bound. Consumed by the
   * docks host when enriching remote iframe URLs with a connection descriptor.
   */
  wsEndpoint?: {
    /** Full `ws://` or `wss://` URL with host and port. */
    url: string
  }

  /**
   * Set {@link DevframeInternalContext.wsEndpoint} and notify subscribers —
   * the WS-binding tiers (side-car, shared-server, and the `unbound` tier's
   * `attach()`) call this once the socket is bound (or `undefined` once torn
   * down) instead of assigning the field directly, so anything that already
   * projected the endpoint (a hub's remote-dock URLs, registered before an
   * async bind resolves) gets a chance to re-project it.
   */
  setWsEndpoint: (endpoint: { url: string } | undefined) => void
  /**
   * Subscribe to every {@link DevframeInternalContext.setWsEndpoint} call.
   * Returns an unsubscribe function. The hub context uses this to refresh
   * the `devframe:docks` shared state so a remote dock registered before the
   * WS port resolves still ends up with a live connection URL.
   */
  onWsEndpointChange: (cb: () => void) => () => void
}

export const internalContextMap = new WeakMap<DevframeNodeContext, DevframeInternalContext>()

export function getInternalContext(context: DevframeNodeContext): DevframeInternalContext {
  if (!internalContextMap.has(context)) {
    const storage = createStorage<InternalAnonymousAuthStorage>({
      filepath: join(context.host.getStorageDir('global'), 'auth.json'),
      initialValue: {
        trusted: {},
      },
    })
    const remoteTokens = new Map<string, RemoteTokenRecord>()
    const wsEndpointListeners = new Set<() => void>()

    function revokeRemoteToken(token: string): void {
      if (!remoteTokens.delete(token))
        return
      void revokeActiveConnectionsForToken(context, token)
    }

    const internalContext: DevframeInternalContext = {
      storage: {
        auth: storage,
      },
      revokeAuthToken: (token: string) => revokeAuthToken(context, storage, token),
      setWsEndpoint(endpoint) {
        internalContext.wsEndpoint = endpoint
        for (const listener of wsEndpointListeners) listener()
      },
      onWsEndpointChange(cb) {
        wsEndpointListeners.add(cb)
        return () => wsEndpointListeners.delete(cb)
      },
      remoteTokens,
      allocateRemoteToken(dockId, origin, originLock) {
        const token = randomToken()
        remoteTokens.set(token, { dockId, origin, originLock })
        return token
      },
      revokeRemoteToken,
      revokeRemoteTokensForDock(dockId) {
        const tokensToRevoke: string[] = []
        for (const [token, record] of remoteTokens) {
          if (record.dockId === dockId)
            tokensToRevoke.push(token)
        }
        for (const token of tokensToRevoke)
          revokeRemoteToken(token)
      },
      isRemoteTokenTrusted(token, requestOrigin) {
        const record = remoteTokens.get(token)
        if (!record)
          return false
        if (!record.originLock)
          return true
        return !!requestOrigin && record.origin === requestOrigin
      },
    }
    internalContextMap.set(context, internalContext)
  }
  return internalContextMap.get(context)!
}
