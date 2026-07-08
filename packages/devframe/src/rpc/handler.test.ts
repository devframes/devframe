import { describe, expect, it } from 'vitest'
import { defineRpcFunction } from './define'
import { getRpcResolvedSetupResult } from './handler'

describe('getRpcResolvedSetupResult', () => {
  it('retries setup after a rejection instead of caching it (object context)', async () => {
    let calls = 0
    const def = defineRpcFunction({
      name: 't:retry',
      type: 'query',
      setup: () => {
        calls++
        if (calls === 1)
          throw new Error('transient')
        return { handler: () => 'ok' }
      },
    })
    const ctx = {}
    await expect(getRpcResolvedSetupResult(def as any, ctx)).rejects.toThrow('transient')
    const result = await getRpcResolvedSetupResult(def as any, ctx)
    expect(result.handler?.()).toBe('ok')
    expect(calls).toBe(2)
  })

  it('caches a successful setup result per context (no re-run)', async () => {
    let calls = 0
    const def = defineRpcFunction({
      name: 't:cache',
      type: 'query',
      setup: () => {
        calls++
        return { handler: () => calls }
      },
    })
    const ctx = {}
    await getRpcResolvedSetupResult(def as any, ctx)
    await getRpcResolvedSetupResult(def as any, ctx)
    expect(calls).toBe(1)
  })
})
