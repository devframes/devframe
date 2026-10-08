import type { DevframeNodeContext, DevframeRpcSharedStates, DevframeSettings, DevframeSettingsStore } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'
import { isAbsolute, join, relative } from 'pathe'
import { createSettingsStore } from '../settings-store'
import { createStorage } from './storage'

// Map a settings scope to the host storage scope it persists under.
// Project settings are per-checkout private state, so they live in the
// host's ignored `project` dir (not the committable `workspace` one).
const STORAGE_SCOPE = { global: 'global', project: 'project' } as const

/** Resolve reserved settings keys before the sync protocol creates an in-memory state. */
export function resolveSettingsState(context: DevframeNodeContext, key: string): SharedState<Record<string, any>> | undefined {
  const match = /^devframe:settings:(global|project):(.+)$/.exec(key)
  if (!match)
    return
  const scope = match[1] as keyof typeof STORAGE_SCOPE
  const namespace = match[2]!
  const dir = join(context.host.getStorageDir(STORAGE_SCOPE[scope]), 'settings')
  const filepath = join(dir, `${namespace}.json`)
  const path = relative(dir, filepath)
  // Keys arrive from clients, so they must stay within the settings directory.
  if (namespace.includes('\0') || path === '..' || path.startsWith('../') || isAbsolute(path))
    return
  return createStorage({ filepath, initialValue: {} })
}

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
      statePromise = context.rpc.sharedState.get(
        stateKey as keyof DevframeRpcSharedStates,
      ) as Promise<SharedState<T>>
    }
    return statePromise
  }

  return createSettingsStore<T>(store)
}

/**
 * Build the node-side `settings` surface for a scope namespace. `project`
 * persists under the host's `project` storage dir, `global` under its
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
