import { describe, expect, it } from 'vitest'
import { DevframeConfigsHostImpl } from '../host-configs'

describe('devframeConfigsHost', () => {
  it('resolves empty before any contribution', () => {
    const configs = new DevframeConfigsHostImpl()
    expect(configs.resolve()).toEqual({})
  })

  it('passes undefined to the updater on the first contribution for a key', () => {
    // The registry is empty in the core package (augmented by consumers like
    // `@devframes/hub`), so the test drives `contribute`/`resolve` untyped.
    const configs = new DevframeConfigsHostImpl() as any
    configs.contribute('dock', (current: any) => {
      expect(current).toBeUndefined()
      return { maxVisibleItems: 4 }
    })
    expect(configs.resolve()).toEqual({ dock: { maxVisibleItems: 4 } })
  })

  it('threads the current value into each subsequent contribution for the same key', () => {
    const configs = new DevframeConfigsHostImpl() as any
    configs.contribute('dock', () => ({ categoryOrder: { app: -40 } }))
    configs.contribute('dock', (current: any) => ({
      categoryOrder: { ...current.categoryOrder, web: 300 },
    }))
    expect(configs.resolve()).toEqual({ dock: { categoryOrder: { app: -40, web: 300 } } })
  })

  it('keeps contributions to different keys independent', () => {
    const configs = new DevframeConfigsHostImpl() as any
    configs.contribute('dock', () => ({ maxVisibleItems: 4 }))
    configs.contribute('ui', () => ({ branding: { productName: 'Test' } }))
    expect(configs.resolve()).toEqual({
      dock: { maxVisibleItems: 4 },
      ui: { branding: { productName: 'Test' } },
    })
  })
})
