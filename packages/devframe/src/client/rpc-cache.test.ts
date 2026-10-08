import type { AddressInfo } from 'node:net'
import type { DevframeRpcClientOptions } from './rpc'
import { createServer } from 'node:http'
import { defineDevframe, defineRpcFunction } from 'devframe'
import { DEVFRAME_EVENTS } from 'devframe/constants'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { initDevframe } from '../adapters/initiate'
import { connectDevframe } from './index'

const connectionGlobals = ['__DEVFRAME_CONNECTION_META__', '__DEVFRAME_CONNECTION_AUTH_TOKEN__', '__DEVFRAME_CONNECTION__']

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: 'vitest' })
  for (const key of connectionGlobals) delete (globalThis as any)[key]
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of connectionGlobals) delete (globalThis as any)[key]
})

async function setup(transport: 'websocket' | 'sse', cacheOptions: DevframeRpcClientOptions['cacheOptions'] = true, legacy = false, callTimeout = 3000) {
  const devframe = initDevframe(defineDevframe({
    id: 'cache-test',
    name: 'Cache test',
    version: '0.0.0',
    packageName: 'cache-test',
    homepage: 'https://example.test',
    description: 'RPC cache regression tests.',
    setup: () => {},
  }), { base: '/__cache/', auth: false })
  const server = createServer((req, res) => devframe.nodeMiddleware(req, res))
  devframe.attach(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  onTestFinished(async () => {
    await devframe.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  const ctx = await devframe.context
  if (legacy)
    ctx.rpc.definitions.delete('devframe:rpc:cacheable-functions')
  const counts: Record<string, number> = {}
  for (const [name, type, cacheable] of [
    ['static', 'static', false],
    ['query', 'query', true],
    ['uncached', 'query', false],
    ['default', 'query', undefined],
    ['action', 'action', true],
    ['event', 'event', true],
  ] as const) {
    ctx.rpc.register(defineRpcFunction({
      name: `test:${name}`,
      type,
      cacheable,
      handler: (value: unknown) => {
        counts[name] = (counts[name] ?? 0) + 1
        return value
      },
    }))
  }
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  vi.stubGlobal('location', new URL(`${origin}/__cache/`))
  const client = await connectDevframe({
    baseURL: `${origin}/__cache/`,
    transport,
    cacheOptions,
    otpParam: false,
    simpleAuth: false,
    webmcp: false,
    callTimeout,
  })
  onTestFinished(() => client.close?.())
  return { ctx, client, counts, call: client.call as (name: string, value?: unknown) => Promise<unknown> }
}

describe.each(['websocket', 'sse'] as const)('automatic RPC cache over %s', (transport) => {
  it('caches static and opted-in queries from the first call, by arguments', async () => {
    const { call, counts } = await setup(transport)
    for (const name of ['static', 'query', 'uncached', 'default', 'action', 'event']) {
      for (const value of [1, 1, 2])
        await expect(call(`test:${name}`, value)).resolves.toBe(value)
    }
    expect(counts).toEqual({ static: 2, query: 2, uncached: 3, default: 3, action: 3, event: 3 })
  })

  it('caches falsy results and keeps event calls reaching the server', async () => {
    const { client, call, counts } = await setup(transport)
    for (const value of [false, 0, '', null, undefined]) {
      await expect(call('test:query', value)).resolves.toBe(value)
      await expect(call('test:query', value)).resolves.toBe(value)
    }
    expect(counts.query).toBe(5)
    await client.callEvent('test:query' as any, 0)
    await client.callEvent('test:query' as any, 0)
    await vi.waitFor(() => expect(counts.query).toBe(7))
  })

  it('preserves explicit function lists and custom serializers', async () => {
    const keySerializer = vi.fn(() => 'same-key')
    const { call, counts } = await setup(transport, { functions: ['test:uncached'], keySerializer })
    await expect(call('test:uncached', 1)).resolves.toBe(1)
    await expect(call('test:uncached', 2)).resolves.toBe(1)
    await call('test:query', 1)
    await call('test:query', 1)
    expect(counts).toEqual({ uncached: 1, query: 2 })
    expect(keySerializer).toHaveBeenCalled()
  })

  it('keeps caching disabled with false', async () => {
    const { call, counts } = await setup(transport, false)
    await call('test:query', 1)
    await call('test:query', 1)
    expect(counts.query).toBe(2)
  })

  it('does not cache rejected results', async () => {
    const { ctx, call } = await setup(transport)
    const handler = vi.fn()
      .mockRejectedValueOnce(new Error('retry me'))
      .mockResolvedValue('ok')
    ctx.rpc.register(defineRpcFunction({ name: 'test:retry', type: 'query', cacheable: true, handler }))
    await expect(call('test:retry')).rejects.toThrow('retry me')
    await expect(call('test:retry')).resolves.toBe('ok')
    await expect(call('test:retry')).resolves.toBe('ok')
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('falls back to uncached calls with an older server', async () => {
    const { call, counts } = await setup(transport, true, true)
    await call('test:query', 1)
    await call('test:query', 1)
    expect(counts.query).toBe(2)
  })

  it('retries discovery after a rejected request without blocking actions', async () => {
    const { ctx, client, call, counts } = await setup(transport)
    await call('test:query', 1)
    const clear = vi.spyOn(client.cacheManager, 'clear')
    const discovery = vi.fn()
      .mockRejectedValueOnce(new Error('temporary discovery failure'))
      .mockResolvedValue(['test:query'])
    ctx.rpc.update(defineRpcFunction({ name: 'devframe:rpc:cacheable-functions', type: 'query', handler: discovery }))
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())

    await expect(call('test:action', 1)).rejects.toThrow('temporary discovery failure')
    expect(counts.action).toBeUndefined()
    await expect(call('test:action', 2)).resolves.toBe(2)
    await expect(call('test:action', 2)).resolves.toBe(2)
    await call('test:query', 1)
    await call('test:query', 1)
    expect(counts).toEqual({ action: 2, query: 2 })
    expect(discovery).toHaveBeenCalledTimes(2)
  })

  it('retries discovery after a timeout and ignores its late response', async () => {
    const { ctx, client, call, counts } = await setup(transport)
    await call('test:query', 1)
    const clear = vi.spyOn(client.cacheManager, 'clear')
    const pending = Promise.withResolvers<string[]>()
    const discovery = vi.fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(['test:query'])
    const timedOut = Promise.withResolvers<void>()
    client.events.on(DEVFRAME_EVENTS.client.error, (_error, method) => {
      if (method === 'devframe:rpc:cacheable-functions')
        timedOut.resolve()
    })
    ctx.rpc.update(defineRpcFunction({ name: 'devframe:rpc:cacheable-functions', type: 'query', handler: discovery }))
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())

    await expect(call('test:action', 1)).rejects.toMatchObject({ kind: 'timeout' })
    await timedOut.promise
    // The error event fires before the discovery promise rejects.
    await new Promise(resolve => setTimeout(resolve, 0))
    pending.resolve(['test:action'])
    expect(counts.action).toBeUndefined()
    await expect(call('test:action', 2)).resolves.toBe(2)
    await expect(call('test:action', 2)).resolves.toBe(2)
    await call('test:query', 1)
    await call('test:query', 1)
    expect(counts).toEqual({ action: 2, query: 2 })
    expect(discovery).toHaveBeenCalledTimes(2)
  })

  it.each(['call', 'callOptional'] as const)('does not send an expired %s after rediscovery, but allows a later retry', async (method) => {
    const { ctx, client, call, counts } = await setup(transport, true, false, 800)
    await call('test:query', 1)
    const clear = vi.spyOn(client.cacheManager, 'clear')
    const first = Promise.withResolvers<string[]>()
    const second = Promise.withResolvers<string[]>()
    const discovery = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    ctx.rpc.update(defineRpcFunction({ name: 'devframe:rpc:cacheable-functions', type: 'query', handler: discovery }))
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())

    const expired = expect(client[method]('test:action' as any, 1)).rejects.toMatchObject({ kind: 'timeout' })
    await vi.waitFor(() => expect(discovery).toHaveBeenCalledTimes(1))
    clear.mockClear()
    await ctx.rpc.broadcast({ method: DEVFRAME_EVENTS.broadcast.cacheInvalidate, args: [] })
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 400))
    first.resolve(['test:query'])
    await vi.waitFor(() => expect(discovery).toHaveBeenCalledTimes(2))

    await expired
    expect(counts.action).toBeUndefined()
    const retry = client[method]('test:action' as any, 1)
    second.resolve(['test:query'])
    await expect(retry).resolves.toBe(1)
    expect(counts.action).toBe(1)
    expect(discovery).toHaveBeenCalledTimes(2)
  })

  it('keeps refreshed discovery when an invalidated request rejects', async () => {
    const { ctx, client, call } = await setup(transport)
    await call('test:query', 1)
    const clear = vi.spyOn(client.cacheManager, 'clear')
    const pending = Promise.withResolvers<string[]>()
    const discovery = vi.fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(['test:query'])
    ctx.rpc.update(defineRpcFunction({ name: 'devframe:rpc:cacheable-functions', type: 'query', handler: discovery }))
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())

    const rejected = expect(call('test:action', 1)).rejects.toThrow('outdated discovery')
    await vi.waitFor(() => expect(discovery).toHaveBeenCalledTimes(1))
    clear.mockClear()
    await ctx.rpc.broadcast({ method: DEVFRAME_EVENTS.broadcast.cacheInvalidate, args: [] })
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())
    await call('test:query', 1)
    pending.reject(new Error('outdated discovery'))
    await rejected
    await call('test:query', 1)
    expect(discovery).toHaveBeenCalledTimes(2)
  })

  it('refreshes eligibility when a function is registered or updated', async () => {
    const { ctx, client, call } = await setup(transport)
    await call('test:query', 1)
    const clear = vi.spyOn(client.cacheManager, 'clear')
    const handler = vi.fn(() => 'new')
    ctx.rpc.register(defineRpcFunction({ name: 'test:late', type: 'query', cacheable: true, handler }))
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())
    await expect(call('test:late')).resolves.toBe('new')
    await expect(call('test:late')).resolves.toBe('new')
    expect(handler).toHaveBeenCalledTimes(1)
    clear.mockClear()
    ctx.rpc.update(defineRpcFunction({ name: 'test:late', type: 'action', handler }))
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())
    await call('test:late')
    await call('test:late')
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('clears results on invalidation and rejects late cache writes', async () => {
    const { ctx, client, call, counts } = await setup(transport)
    const pending = Promise.withResolvers<string>()
    const handler = vi.fn(() => pending.promise)
    ctx.rpc.register(defineRpcFunction({ name: 'test:slow', type: 'query', cacheable: true, handler }))
    await call('test:query', 1)
    const slow = call('test:slow')
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
    const clear = vi.spyOn(client.cacheManager, 'clear')
    await ctx.rpc.broadcast({ method: DEVFRAME_EVENTS.broadcast.cacheInvalidate, args: [] })
    await vi.waitFor(() => expect(clear).toHaveBeenCalled())
    pending.resolve('old')
    await slow
    await call('test:slow')
    expect(handler).toHaveBeenCalledTimes(2)
    await call('test:query', 1)
    expect(counts.query).toBe(2)
  })

  it('clears cached results when trust is revoked and when closed', async () => {
    const { ctx, client, call } = await setup(transport)
    await call('test:query', 1)
    expect(client.cacheManager.has('test:query', [1])).toBe(true)
    await client.services.state()
    await ctx.rpc.broadcast({ method: DEVFRAME_EVENTS.broadcast.authRevoked, args: [] })
    await vi.waitFor(() => expect(client.isTrusted).toBe(false))
    expect(client.cacheManager.has('test:query', [1])).toBe(false)
    await expect(call('test:query', 1)).rejects.toThrow(/Not authorized/)
    await client.requestTrust()
    await call('test:query', 1)
    client.close?.()
    expect(client.cacheManager.has('test:query', [1])).toBe(false)
    await expect(call('test:query', 1)).rejects.toMatchObject({ kind: 'connection' })
  })
})
