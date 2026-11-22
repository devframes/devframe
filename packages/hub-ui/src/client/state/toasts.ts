import type { DevframeMessageEntry } from '@devframes/hub'
import type { Reactive } from 'vue'
import { reactive } from 'vue'

interface ToastItem {
  id: string
  entry: DevframeMessageEntry
}

export function createToastStore() {
  const items: Reactive<ToastItem[]> = reactive([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function cancelTimer(id: string): void {
    const timer = timers.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(id)
    }
  }

  function dismiss(id: string): void {
    const index = items.findIndex(toast => toast.id === id)
    if (index !== -1)
      items.splice(index, 1)
    cancelTimer(id)
  }

  function add(entry: DevframeMessageEntry): void {
    const existing = items.find(toast => toast.id === entry.id)
    if (existing) {
      existing.entry = entry
      cancelTimer(entry.id)
    }
    else {
      items.push({ id: entry.id, entry })
    }
    const timeout = entry.autoDismiss ?? 5000
    if (timeout !== false)
      timers.set(entry.id, setTimeout(dismiss, timeout, entry.id))
  }

  return { items, add, dismiss }
}
