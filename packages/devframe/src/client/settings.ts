import type { DevframeSettings, DevframeSettingsStore } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import type { DevframeRpcClient } from './rpc'

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

  return {
    async get(key) {
      return ((await store()).value() as T)[key]
    },
    async set(key, value) {
      ;(await store()).mutate((draft) => {
        ;(draft as T)[key] = value
      })
    },
    async delete(key) {
      ;(await store()).mutate((draft) => {
        delete (draft as T)[key]
      })
    },
    async all() {
      return (await store()).value() as Readonly<T>
    },
    async onChange(fn) {
      return (await store()).on('updated', full => fn(full as Readonly<T>))
    },
  }
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
