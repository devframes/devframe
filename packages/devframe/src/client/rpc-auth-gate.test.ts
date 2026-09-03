import type { ConnectionMeta } from 'devframe/types'
import type { DevframeRpcClientMode } from './rpc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `getDevframeRpcClient` starts the auth bootstrap without awaiting it, so the
// client returns before trust lands. This guards the regression where a
// caller's first `rpc.call()` races that bootstrap and gets rejected with
// DF0036 over the open-but-untrusted socket. A controllable fake `./rpc-ws`
// mode lets the test control when trust resolves.
const fakeMode = vi.hoisted(() => {
  const requestTrustGate = { resolve: undefined as ((value: boolean) => void) | undefined }
  const call = vi.fn(async () => 'ok')
  const callOptional = vi.fn(async () => 'ok')
  const callEvent = vi.fn(async () => {})
  return { requestTrustGate, call, callOptional, callEvent }
})

vi.mock('./rpc-ws', () => ({
  createWsRpcClientMode: vi.fn((): DevframeRpcClientMode => ({
    isTrusted: false,
    status: 'connecting',
    connectionError: null,
    ensureTrusted: async () => true,
    requestTrust: () => new Promise<boolean>((resolve) => {
      fakeMode.requestTrustGate.resolve = resolve
    }),
    requestTrustWithToken: async () => true,
    requestTrustWithCode: async () => null,
    call: fakeMode.call as DevframeRpcClientMode['call'],
    callOptional: fakeMode.callOptional as DevframeRpcClientMode['callOptional'],
    callEvent: fakeMode.callEvent as DevframeRpcClientMode['callEvent'],
    // No `close` here on purpose; `close` is optional precisely so a mode written before it
    // existed (this one) still satisfies the interface.
  })),
}))

class FakeBroadcastChannel {
  onmessage: ((e: any) => void) | null = null
  postMessage(): void {}
  close(): void {}
}

const connectionMeta: ConnectionMeta = { backend: 'websocket', websocket: { path: '__ws' } }

describe('getDevframeRpcClient: auth bootstrap gates outbound calls', () => {
  beforeEach(() => {
    fakeMode.requestTrustGate.resolve = undefined
    fakeMode.call.mockClear()
    fakeMode.callOptional.mockClear()
    fakeMode.callEvent.mockClear()
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    vi.stubGlobal('navigator', { userAgent: 'test' })
    vi.stubGlobal('location', {
      protocol: 'http:',
      host: 'localhost:5173',
      hostname: 'localhost',
      href: 'http://localhost:5173/index.html',
      origin: 'http://localhost:5173',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('holds `call` until the in-flight bootstrap settles, instead of sending it early', async () => {
    const { getDevframeRpcClient } = await import('./rpc')
    const rpc = await getDevframeRpcClient({
      connectionMeta,
      otpParam: false,
      simpleAuth: false,
    })

    // Fired the instant the client is available, mirroring a component's
    // `onMount` calling a trusted method right after `connectDevframe()`.
    const pending = rpc.call('test:probe' as any)
    await Promise.resolve()
    await Promise.resolve()
    // The bootstrap's `requestTrust()` hasn't resolved yet, so the call must
    // not have reached the (mocked) transport.
    expect(fakeMode.call).not.toHaveBeenCalled()

    // The handshake lands.
    fakeMode.requestTrustGate.resolve?.(true)

    await expect(pending).resolves.toBe('ok')
    expect(fakeMode.call).toHaveBeenCalledTimes(1)
    expect(fakeMode.call).toHaveBeenCalledWith('test:probe')
  })

  it('holds `callOptional` and `callEvent` the same way', async () => {
    const { getDevframeRpcClient } = await import('./rpc')
    const rpc = await getDevframeRpcClient({
      connectionMeta,
      otpParam: false,
      simpleAuth: false,
    })

    const pendingOptional = rpc.callOptional('test:optional' as any)
    const pendingEvent = rpc.callEvent('test:event' as any)
    await Promise.resolve()
    await Promise.resolve()
    expect(fakeMode.callOptional).not.toHaveBeenCalled()
    expect(fakeMode.callEvent).not.toHaveBeenCalled()

    fakeMode.requestTrustGate.resolve?.(true)

    await expect(pendingOptional).resolves.toBe('ok')
    await pendingEvent
    expect(fakeMode.callOptional).toHaveBeenCalledTimes(1)
    expect(fakeMode.callEvent).toHaveBeenCalledTimes(1)
  })

  it('stops gating once the first bootstrap attempt has settled', async () => {
    const { getDevframeRpcClient } = await import('./rpc')
    const rpc = await getDevframeRpcClient({
      connectionMeta,
      otpParam: false,
      simpleAuth: false,
    })

    fakeMode.requestTrustGate.resolve?.(true)
    // Let the bootstrap's own promise chain fully settle before the next
    // call; a few microtask ticks cover `await mode.requestTrust()`
    // resuming, `bootstrapAuth()` returning, and its `.then()` flipping
    // `bootstrapAuthSettled`.
    for (let i = 0; i < 5; i++)
      await Promise.resolve()

    await rpc.call('test:probe' as any)
    // Sent straight through; no more waiting once bootstrap is over.
    expect(fakeMode.call).toHaveBeenCalledTimes(1)
  })

  it('close() is a no-op, not a throw, against a mode that predates it', async () => {
    const { getDevframeRpcClient } = await import('./rpc')
    const rpc = await getDevframeRpcClient({
      connectionMeta,
      otpParam: false,
      simpleAuth: false,
    })

    // The mocked mode above has no `close` at all, exactly the pre-existing-mode case
    // `close?:` exists to keep working.
    expect(() => rpc.close?.()).not.toThrow()
  })
})
