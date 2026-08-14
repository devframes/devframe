import type { Ref } from 'vue'
import { useSessionStorage } from '@vueuse/core'
import { inject } from 'vue'
import { DOCK_ENTRY_ID_KEY } from './dock-entry-id'

/**
 * Session-persisted fallback for a json-render element's own *uncontrolled*
 * value — the local state `Tabs`/`Select`/`Switch`/`TextInput` fall back to
 * when the bindable prop has no `$bindState` binding (`useBoundProp`'s setter
 * is a no-op without one). On by default: calling this instead of a plain
 * `ref(defaultValue)` survives a reload within the same tab.
 *
 * The key combines the current dock's id ({@link DOCK_ENTRY_ID_KEY}, absent
 * outside a devframe dock) with a caller-supplied `signature` identifying the
 * element within that dock — `kind` (the component, e.g. `'Tabs'`) plus the
 * element's own static props. There is no element id to key off directly here
 * (unlike some other json-render integrations' render context): a shape
 * change yields a different key, so persistence falls back to `defaultValue`
 * instead of restoring a stale value for a different element — intended, not
 * a bug.
 */
export function useUncontrolledValue<T>(kind: string, signature: Record<string, unknown>, defaultValue: T): Ref<T> {
  const dockEntryId = inject(DOCK_ENTRY_ID_KEY, undefined)
  const key = `devframes-json-render-uncontrolled:${dockEntryId ?? '~'}:${kind}:${JSON.stringify(signature)}`
  return useSessionStorage<T>(key, defaultValue)
}
