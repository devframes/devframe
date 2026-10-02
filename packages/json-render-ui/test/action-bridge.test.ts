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

  it('clears an action error when retrying and keeps it clear after success', async () => {
    expect.assertions(6)
    const retry = Promise.withResolvers<string>()
    const call = vi.fn(async () => 'ok')
      .mockRejectedValueOnce(new Error('first attempt failed'))
      .mockReturnValueOnce(retry.promise)
    const bridge = createActionBridge({ call })

    await expect(bridge.handlers.refreshData()).rejects.toThrow('first attempt failed')
    const pending = bridge.handlers.refreshData()
    expect(bridge.loading.refreshData).toBe(true)
    expect(bridge.error.value).toBeNull()
    retry.resolve('ok')
    await expect(pending).resolves.toBe('ok')
    expect(bridge.error.value).toBeNull()
    expect(bridge.loading.refreshData).toBe(false)
  })

  it('reports the new error when a retry fails', async () => {
    expect.assertions(3)
    const retryError = new Error('retry failed')
    const call = vi.fn()
      .mockRejectedValueOnce(new Error('first attempt failed'))
      .mockRejectedValueOnce(retryError)
    const bridge = createActionBridge({ call })

    await expect(bridge.handlers.refreshData()).rejects.toThrow('first attempt failed')
    await expect(bridge.handlers.refreshData()).rejects.toThrow('retry failed')
    expect(bridge.error.value).toEqual({ action: 'refreshData', error: retryError })
  })

  it('preserves an error when another action succeeds', async () => {
    expect.assertions(3)
    const error = new Error('refresh failed')
    const call = vi.fn(async () => 'ok').mockRejectedValueOnce(error)
    const bridge = createActionBridge({ call })

    await expect(bridge.handlers.refreshData()).rejects.toThrow('refresh failed')
    await expect(bridge.handlers.saveData()).resolves.toBe('ok')
    expect(bridge.error.value).toEqual({ action: 'refreshData', error })
  })

  it('preserves a failure received while a retry is pending', async () => {
    expect.assertions(4)
    const retry = Promise.withResolvers<string>()
    const error = new Error('save failed')
    const call = vi.fn(async () => 'ok')
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockReturnValueOnce(retry.promise)
      .mockRejectedValueOnce(error)
    const bridge = createActionBridge({ call })

    await expect(bridge.handlers.refreshData()).rejects.toThrow('refresh failed')
    const pending = bridge.handlers.refreshData()
    await expect(bridge.handlers.saveData()).rejects.toThrow('save failed')
    retry.resolve('ok')
    await expect(pending).resolves.toBe('ok')
    expect(bridge.error.value).toEqual({ action: 'saveData', error })
  })
})
