import type { DevframeSettings, DevframeSettingsStore } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { DevframeRpcClient } from './rpc'
import { createSettingsStore } from '../settings-store'

function createClientSettingsStore<T extends Record<string, any>>(
  rpc: DevframeRpcClient,
  namespace: string,
  scope: 'global' | 'project',
): DevframeSettingsStore<T> {
  const stateKey = `devframe:settings:${scope}:${namespace}`
  let statePromise: Promise<SharedState<T>> | undefined

  // The client mirrors the server's file-backed settings store over the
  // shared-state sync protocol: providing an empty initial value lets the
  // client subscribe and merge the authoritative server snapshot, and any
  // local `set` is pushed back to (and persisted by) the server.
  function store(): Promise<SharedState<T>> {
    if (!statePromise) {
      statePromise = (rpc.sharedState.get as any)(stateKey, { initialValue: {} }) as Promise<SharedState<T>>
    }
    return statePromise
  }

  return createSettingsStore<T>(store)
}

/**
 * Build the client-side `settings` surface for a scope namespace. Mirrors
 * the node-side stores over the shared-state sync protocol.
 */
export function createClientSettings<T extends Record<string, any> = Record<string, any>>(
  rpc: DevframeRpcClient,
  namespace: string,
): DevframeSettings<T> {
  return {
    global: createClientSettingsStore<T>(rpc, namespace, 'global'),
    project: createClientSettingsStore<T>(rpc, namespace, 'project'),
  }
}
