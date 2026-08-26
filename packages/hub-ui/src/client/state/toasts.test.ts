import type { DevframeMessageEntry } from '@devframes/hub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addToast, dismissToast, useToasts } from './toasts'

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

function dismissAllToasts(): void {
  for (const toast of [...useToasts()])
    dismissToast(toast.id)
}

describe('toast auto-dismiss', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    dismissAllToasts()
  })

  afterEach(() => {
    dismissAllToasts()
    vi.useRealTimers()
  })

  it('keeps a persistent toast visible until it is explicitly dismissed', () => {
    addToast(createMessage('persistent', false))

    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(60_000)

    expect(useToasts()).toHaveLength(1)

    dismissToast('persistent')

    expect(useToasts()).toHaveLength(0)
  })

  it('cancels an existing auto-dismiss timer when its toast becomes persistent', () => {
    addToast(createMessage('updated', 1_000))

    expect(vi.getTimerCount()).toBe(1)

    addToast(createMessage('updated', false))

    expect(vi.getTimerCount()).toBe(0)

    vi.advanceTimersByTime(60_000)

    expect(useToasts()).toHaveLength(1)
  })

  it('continues to auto-dismiss timed toasts', () => {
    addToast(createMessage('timed', 1_000))

    vi.advanceTimersByTime(999)
    expect(useToasts()).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(useToasts()).toHaveLength(0)
  })
})
