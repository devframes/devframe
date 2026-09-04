import type { DevframeNodeContext, DevframeRpcSharedStates, DevframeSettings, DevframeSettingsStore } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import { join } from 'pathe'
import { createSettingsStore } from '../settings-store'
import { createStorage } from './storage'

// Map a settings scope to the host storage scope it persists under.
// Project settings are per-checkout private state, so they live in the
// host's ignored `project` dir (not the committable `workspace` one).
const STORAGE_SCOPE = { global: 'global', project: 'project' } as const

function createNodeSettingsStore<T extends Record<string, any>>(
  context: DevframeNodeContext,
  namespace: string,
  scope: 'global' | 'project',
): DevframeSettingsStore<T> {
  const stateKey = `devframe:settings:${scope}:${namespace}`
  let statePromise: Promise<SharedState<T>> | undefined

  // Lazily resolve a file-backed shared state. Registering it as a
  // shared state means a `set` on either the node or a connected client
  // propagates to every peer via the existing sync protocol, while the
  // backing `createStorage` debounces writes to disk.
  function store(): Promise<SharedState<T>> {
    if (!statePromise) {
      const dir = context.host.getStorageDir(STORAGE_SCOPE[scope])
      const filepath = join(dir, 'settings', `${namespace}.json`)
      statePromise = context.rpc.sharedState.get(
        stateKey as keyof DevframeRpcSharedStates,
        { sharedState: createStorage<T>({ filepath, initialValue: {} as T }) as any },
      ) as Promise<SharedState<T>>
    }
    return statePromise
  }

  return createSettingsStore<T>(store)
}

/**
 * Build the node-side `settings` surface for a scope namespace. `project`
 * persists under the host's `workspace` storage dir, `global` under its
 * `global` dir. Each is a file-backed, client-synced key-value store.
 */
export function createNodeSettings<T extends Record<string, any> = Record<string, any>>(
  context: DevframeNodeContext,
  namespace: string,
): DevframeSettings<T> {
  return {
    global: createNodeSettingsStore<T>(context, namespace, 'global'),
    project: createNodeSettingsStore<T>(context, namespace, 'project'),
  }
}
