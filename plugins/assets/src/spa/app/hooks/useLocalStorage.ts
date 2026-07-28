import { useCallback, useState } from 'preact/hooks'

/** Per-browser UI preference (view mode, filters) — not collaborative state, so plain `localStorage` beats devframe shared state here. */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    }
    catch {
      return initial
    }
  })

  const set = useCallback((next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    }
    catch {
      // Storage disabled/full — the preference just doesn't persist.
    }
  }, [key])

  return [value, set]
}
