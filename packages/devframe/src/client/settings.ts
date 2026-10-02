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

  // Resolve the server snapshot before reading or changing settings so that
  // initialization cannot overwrite the first local operation.
  function store(): Promise<SharedState<T>> {
    if (!statePromise) {
      statePromise = (async () => {
        await rpc.ensureTrusted()
        const state = await rpc.sharedState.get<T>(stateKey)
        if (state.value() === undefined)
          state.mutate(() => ({} as T))
        return state
      })().catch((error) => {
        statePromise = undefined
        throw error
      })
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
