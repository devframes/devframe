import type { DevframeRpcClientFunctions } from 'devframe/types'
import type { DevframeClientRpcHost, DevframeRpcContext, RpcClientEvents } from './rpc'
import { RpcFunctionsCollectorBase } from 'devframe/rpc'
import { createEventEmitter } from 'devframe/utils/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveRpcClientMode } from './rpc-live'

vi.mock('devframe/rpc/client', () => ({
  createRpcClient: () => ({ $call: vi.fn(async () => ({ isTrusted: true })) }),
}))

function createMode() {
  const clientRpc: DevframeClientRpcHost = new RpcFunctionsCollectorBase<DevframeRpcClientFunctions, DevframeRpcContext>({ rpc: undefined! })
  return createLiveRpcClientMode({
    transport: 'websocket',
    connectionMeta: { backend: 'websocket', websocket: { path: '__ws' } },
    events: createEventEmitter<RpcClientEvents>(),
    clientRpc,
    createChannel: () => ({ post: vi.fn(), on: vi.fn(), close: vi.fn() }),
  })
}

describe('trust deadline cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { userAgent: 'test' })
    vi.stubGlobal('location', { origin: 'http://localhost' })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('clears concurrent deadlines as soon as authentication succeeds', async () => {
    expect.assertions(4)
    const mode = createMode()
    const first = mode.ensureTrusted(60_000)
    const second = mode.ensureTrusted(30_000)
    expect(vi.getTimerCount()).toBe(2)
    await mode.requestTrustWithToken('test-token')
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves no deadline behind when already trusted', async () => {
    expect.assertions(2)
    const mode = createMode()
    await mode.requestTrustWithToken('test-token')
    await expect(mode.ensureTrusted()).resolves.toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves expiry and unlimited trust waits', async () => {
    expect.assertions(4)
    const mode = createMode()
    const unlimited = mode.ensureTrusted(0)
    expect(vi.getTimerCount()).toBe(0)
    const expiry = expect(mode.ensureTrusted(10)).rejects.toThrow('Timeout waiting for rpc to be trusted')
    await vi.advanceTimersByTimeAsync(10)
    await expiry
    expect(vi.getTimerCount()).toBe(0)
    await mode.requestTrustWithToken('test-token')
    await expect(unlimited).resolves.toBe(true)
  })
})
