import type { DevframeSettingsStore } from 'devframe/types'
import type { SharedState } from 'devframe/utils/shared-state'

/**
 * The key-value store surface over a lazily-resolved shared state, shared by
 * the node-side (file-backed) and client-side (RPC-mirrored) settings stores.
 * Each side supplies its own `store()` resolver; the read/write/subscribe
 * behavior on top of it is identical.
 */
export function createSettingsStore<T extends Record<string, any>>(
  store: () => Promise<SharedState<T>>,
): DevframeSettingsStore<T> {
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
