import { describe, expect, it, vi } from 'vitest'
import { createActionBridge } from '../src/action-bridge'

describe('action bridge', () => {
  it('dispatches any action name as an RPC call of the same name', async () => {
    const call = vi.fn(async () => 'ok')
    const bridge = createActionBridge({ call })
    const result = await bridge.handlers.refreshData({ id: 1 })
    expect(call).toHaveBeenCalledWith('refreshData', { id: 1 })
    expect(result).toBe('ok')
  })

  it('does not shadow upstream built-ins', () => {
    const bridge = createActionBridge({ call: async () => undefined })
    expect(bridge.handlers.setState).toBeUndefined()
    expect(bridge.handlers.pushState).toBeUndefined()
    expect(bridge.handlers.validateForm).toBeUndefined()
    expect((bridge.handlers as any).then).toBeUndefined()
  })

  it('tracks per-action loading state', async () => {
    let resolve!: () => void
    const call = vi.fn(() => new Promise<void>((r) => {
      resolve = r
    }))
    const bridge = createActionBridge({ call })
    const p = bridge.handlers.slow()
    expect(bridge.loading.slow).toBe(true)
    resolve()
    await p
    expect(bridge.loading.slow).toBe(false)
  })

  it('surfaces and rethrows RPC failures', async () => {
    const err = new Error('boom')
    const bridge = createActionBridge({
      call: async () => {
        throw err
      },
    })
    await expect(bridge.handlers.explode()).rejects.toThrow('boom')
    expect(bridge.error.value).toEqual({ action: 'explode', error: err })
  })

  it('rejects with an unavailable error in static (non-interactive) output', async () => {
    const call = vi.fn()
    const bridge = createActionBridge({ call }, { interactive: false })
    await expect(bridge.handlers.doThing()).rejects.toThrow(/unavailable in static output/)
    expect(call).not.toHaveBeenCalled()
    expect(bridge.error.value?.action).toBe('doThing')
  })
})
