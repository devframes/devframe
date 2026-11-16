import type { DevframeMessageEntry } from '@devframes/hub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToastStore } from './toasts'

function createMessage(id: string, autoDismiss: number | false): DevframeMessageEntry {
  return {
    id,
    message: id,
    level: 'info',
    from: 'browser',
    timestamp: 0,
    autoDismiss,
  }
}

describe('toast auto-dismiss', () => {
  let store: ReturnType<typeof createToastStore>

  beforeEach(() => {
    vi.useFakeTimers()
    store = createToastStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a persistent toast visible until it is explicitly dismissed', () => {
    store.add(createMessage('persistent', false))

    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(60_000)

    expect(store.items).toHaveLength(1)

    store.dismiss('persistent')

    expect(store.items).toHaveLength(0)
  })

  it('cancels an existing auto-dismiss timer when its toast becomes persistent', () => {
    store.add(createMessage('updated', 1_000))

    expect(vi.getTimerCount()).toBe(1)

    store.add(createMessage('updated', false))

    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(60_000)

    expect(store.items).toHaveLength(1)
  })

  it('continues to auto-dismiss timed toasts', () => {
    store.add(createMessage('timed', 1_000))

    vi.advanceTimersByTime(999)
    expect(store.items).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(store.items).toHaveLength(0)
  })
})
