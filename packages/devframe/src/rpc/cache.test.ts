import { expect, it } from 'vitest'
import { RpcCacheManager } from './cache'

it('cache', async () => {
  const cache = new RpcCacheManager({ functions: ['fn3'] })

  expect(cache.validate('fn1')).toBe(false)
  expect(cache.validate('fn3')).toBe(true)

  cache.updateOptions({ functions: ['fn1', 'fn2'] })
  expect(cache.validate('fn1')).toBe(true)
  expect(cache.validate('fn2')).toBe(true)
  expect(cache.validate('fn3')).toBe(false)
  cache.apply({ m: 'fn1', a: [1, 2] }, 100)
  cache.apply({ m: 'fn2', a: [3, 4] }, 200)
  expect(cache.cached<number>('fn1', [1, 2])).toBe(100)
  cache.clear('fn1')
  expect(cache.cached<number>('fn1', [1, 2])).toBeUndefined()
  cache.clear()
  expect(cache.cached<number>('fn2', [3, 4])).toBeUndefined()
})

it('serves falsy cached values via `has` (presence, not truthiness)', () => {
  const cache = new RpcCacheManager({ functions: ['fn'] })

  // absent key: `has` reports false, distinct from a stored falsy value
  expect(cache.has('fn', ['zero'])).toBe(false)

  cache.apply({ m: 'fn', a: ['zero'] }, 0)
  cache.apply({ m: 'fn', a: ['false'] }, false)
  cache.apply({ m: 'fn', a: ['empty'] }, '')
  cache.apply({ m: 'fn', a: ['null'] }, null)

  expect(cache.has('fn', ['zero'])).toBe(true)
  expect(cache.has('fn', ['false'])).toBe(true)
  expect(cache.has('fn', ['empty'])).toBe(true)
  expect(cache.has('fn', ['null'])).toBe(true)

  expect(cache.cached('fn', ['zero'])).toBe(0)
  expect(cache.cached('fn', ['false'])).toBe(false)
  expect(cache.cached('fn', ['empty'])).toBe('')
  expect(cache.cached('fn', ['null'])).toBe(null)
})

it('the client cache path (has-then-cached) serves a falsy value without a second fetch', async () => {
  const cache = new RpcCacheManager({ functions: ['fn'] })
  let nextCalls = 0
  const next = async (req: { m: string, a: unknown[] }) => {
    nextCalls++
    cache.apply(req, 0)
    return 0
  }

  // mirrors the onRequest cache path in client/rpc.ts
  async function callThroughCache(req: { m: string, a: unknown[] }) {
    if (cache.has(req.m, req.a))
      return cache.cached(req.m, req.a)
    return next(req)
  }

  expect(await callThroughCache({ m: 'fn', a: [] })).toBe(0)
  expect(await callThroughCache({ m: 'fn', a: [] })).toBe(0)
  expect(nextCalls).toBe(1) // second call served from cache, not re-fetched
})
