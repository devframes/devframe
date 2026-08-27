import { afterEach, describe, expect, it, vi } from 'vitest'
import { HUB_UI_HIDE_EVENT } from '../constants'
import { setupEmbeddedVisibility } from './visibility'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('setupEmbeddedVisibility', () => {
  it('handles the initial hidden state and later reveal and conceal transitions', () => {
    expect.assertions(5)

    const listeners = new Map<string, EventListener>()
    vi.stubGlobal('window', {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener)
      }),
    })
    const show = vi.fn()
    const hide = vi.fn()

    setupEmbeddedVisibility('hidden', 'Devframe', { show, hide })

    expect(hide).toHaveBeenCalledOnce()
    expect(show).not.toHaveBeenCalled()

    const preventDefault = vi.fn()
    listeners.get('keydown')!({
      shiftKey: true,
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      code: 'KeyD',
      preventDefault,
    } as unknown as KeyboardEvent)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(show).toHaveBeenCalledOnce()

    listeners.get(HUB_UI_HIDE_EVENT)!({} as Event)
    expect(hide).toHaveBeenCalledTimes(2)
  })
})
