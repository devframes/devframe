import type { Ref } from 'vue'
import { ref, watch } from 'vue'

/** Per-browser UI preference (view mode, panel width), not collaborative state, so plain `localStorage` beats devframe shared state here. */
export function useLocalStorage<T>(key: string, initial: T): Ref<T> {
  const read = (): T => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    }
    catch {
      return initial
    }
  }

  const value = ref(read()) as Ref<T>

  watch(value, (next) => {
    try {
      localStorage.setItem(key, JSON.stringify(next))
    }
    catch {
      // Storage disabled or full; the preference just doesn't persist.
    }
  }, { deep: true })

  return value
}
