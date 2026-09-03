import type { DevframeServiceMeta, DevframeServiceScopeOf, DevframeServicesState } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { DevframeRpcClient } from './rpc'
import type { DevframeScopedClientRpc } from './scope'
import { DEVFRAME_SERVICES_STATE_KEY } from 'devframe/constants'

/**
 * A typed handle on one advertised wire service: the service's
 * advertisement meta plus an RPC surface scoped to its namespace, so
 * `handle.rpc.call('fn-name', …)` targets `<scope>:fn-name`. Service
 * packages type the calls by augmenting `DevframeRpcServerFunctions` with
 * their fully-qualified ids and `DevframeServicesScopeRegistry` with their
 * package → scope mapping.
 */
export interface DevframeServiceClientHandle<NS extends string = string> extends DevframeServiceMeta {
  readonly scope: NS
  /** RPC surface scoped to the service's namespace. */
  readonly rpc: DevframeScopedClientRpc<NS>
}

/**
 * Client-side view of the server's wire-service registry, mirrored through
 * the reactive `devframe:services` shared state. The accessors are
 * synchronous snapshots; before the first sync lands (or on a server with
 * no services) they read as empty. For reactive UI (e.g. hiding an
 * "open in editor" button until the service appears), subscribe to the
 * shared state itself via {@link DevframeServicesClient.state}.
 */
export interface DevframeServicesClient {
  /** Whether the service package is advertised as installed. */
  has: (pkg: string) => boolean
  /**
   * A typed handle on an advertised service (its meta plus a scoped RPC
   * surface), or `undefined` while it isn't available (never throws).
   */
  get: <PKG extends string>(pkg: PKG) => DevframeServiceClientHandle<DevframeServiceScopeOf<PKG>> | undefined
  /** Package names of every advertised service. */
  keys: () => string[]
  /**
   * The mirrored `devframe:services` shared state; subscribe to its
   * `updated` event for reactivity.
   */
  state: () => Promise<SharedState<DevframeServicesState>>
}

/** @internal */
export function createDevframeServicesClient(rpc: DevframeRpcClient): DevframeServicesClient {
  let current: DevframeServicesState = {}
  // Handles are cached per advertisement entry so repeated `get()` reads
  // return a stable object (immer only replaces an entry when it changed).
  const handles = new WeakMap<DevframeServiceMeta, DevframeServiceClientHandle>()

  let statePromise: Promise<SharedState<DevframeServicesState>> | undefined
  const state = () => {
    statePromise ??= rpc.sharedState
      .get<DevframeServicesState>(DEVFRAME_SERVICES_STATE_KEY, { initialValue: {} })
      .then((shared) => {
        current = shared.value() as DevframeServicesState
        shared.on('updated', (value) => {
          current = value as DevframeServicesState
        })
        return shared
      })
    return statePromise
  }
  // Warm the mirror eagerly so the synchronous accessors work as soon as the
  // first snapshot lands, without every consumer having to await `state()`.
  void state()

  return {
    state,
    has: pkg => pkg in current,
    keys: () => Object.keys(current),
    get: <PKG extends string>(pkg: PKG) => {
      const entry = current[pkg]
      if (!entry)
        return undefined
      let handle = handles.get(entry)
      if (!handle) {
        handle = { ...entry, rpc: rpc.scope(entry.scope).rpc }
        handles.set(entry, handle)
      }
      return handle as DevframeServiceClientHandle<DevframeServiceScopeOf<PKG>>
    },
  }
}
