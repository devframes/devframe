import type { ConnectionMeta } from 'devframe/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDevframeRpcClient } from './rpc'

const CONNECTION_META_KEY = '__DEVFRAME_CONNECTION_META__'
const CONNECTION_AUTH_TOKEN_KEY = '__DEVFRAME_CONNECTION_AUTH_TOKEN__'

// Minimal fake WebSocket: records the URL it was dialed with (all this suite
// needs) and never opens, so the trust handshake stays pending.
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  send(): void {}
  close(): void {}
}

class FakeBroadcastChannel {
  onmessage: ((e: any) => void) | null = null
  postMessage(): void {}
  close(): void {}
}

function lastWsUrl(): string {
  return FakeWebSocket.instances.at(-1)!.url
}

describe('getDevframeRpcClient — connection meta base', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    vi.stubGlobal('navigator', { userAgent: 'test' })
    vi.stubGlobal('location', {
      protocol: 'http:',
      host: 'localhost:5173',
      hostname: 'localhost',
      // The SPA under test is mounted at /__foo/.
      href: 'http://localhost:5173/__foo/index.html',
      origin: 'http://localhost:5173',
    })
    delete (globalThis as any)[CONNECTION_META_KEY]
    delete (globalThis as any)[CONNECTION_AUTH_TOKEN_KEY]
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (globalThis as any)[CONNECTION_META_KEY]
    delete (globalThis as any)[CONNECTION_AUTH_TOKEN_KEY]
  })

  it('publishes the meta annotated with the absolute base it resolved from', async () => {
    const served: ConnectionMeta = { backend: 'websocket', websocket: { path: '__ws' } }
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => served }) as any))

    await getDevframeRpcClient({ baseURL: '/__foo/', otpParam: false })

    const published = (globalThis as any)[CONNECTION_META_KEY] as ConnectionMeta
    expect(published.baseUrl).toBe('http://localhost:5173/__foo/__connection.json')
    // The publisher itself dials the endpoint relative to its own base.
    expect(lastWsUrl()).toBe('ws://localhost:5173/__foo/__ws')
  })

  it('inherits the publisher base so a child at another base dials the shared endpoint', async () => {
    // A same-origin parent already published its meta, carrying the base it was
    // resolved against (`/__devtools/`), not this child's base (`/__foo/`).
    ;(globalThis as any)[CONNECTION_META_KEY] = {
      backend: 'websocket',
      websocket: { path: '__ws' },
      baseUrl: 'http://localhost:5173/__devtools/__connection.json',
    } satisfies ConnectionMeta
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const rpc = await getDevframeRpcClient({ baseURL: '/__foo/', otpParam: false })

    // No fetch — the meta came off the window.
    expect(fetchSpy).not.toHaveBeenCalled()
    // Resolved against the inherited base, not the child's own `/__foo/`.
    expect(lastWsUrl()).toBe('ws://localhost:5173/__devtools/__ws')
    expect(rpc.connectionMeta.baseUrl).toBe('http://localhost:5173/__devtools/__connection.json')
  })

  it('uses a token embedded in the (hub-served) connection meta as the bearer token', async () => {
    // A hub bakes the token into the per-frame meta so a cross-origin frame —
    // which can't read the hub's localStorage — is pre-authorized on connect.
    await getDevframeRpcClient({
      baseURL: '/__foo/',
      otpParam: false,
      simpleAuth: false,
      connectionMeta: { backend: 'websocket', websocket: { path: '__ws' }, authToken: 'hub-token' },
    })

    expect(lastWsUrl()).toContain('devframe_auth_token=hub-token')
  })

  it('prefers an explicit authToken option over the connection-meta token', async () => {
    await getDevframeRpcClient({
      baseURL: '/__foo/',
      otpParam: false,
      simpleAuth: false,
      authToken: 'explicit-token',
      connectionMeta: { backend: 'websocket', websocket: { path: '__ws' }, authToken: 'hub-token' },
    })

    expect(lastWsUrl()).toContain('devframe_auth_token=explicit-token')
  })

  it('ignores a window baseUrl when connection meta is passed explicitly', async () => {
    ;(globalThis as any)[CONNECTION_META_KEY] = {
      backend: 'websocket',
      websocket: { path: '__ws' },
      baseUrl: 'http://localhost:5173/__devtools/__connection.json',
    } satisfies ConnectionMeta

    await getDevframeRpcClient({
      baseURL: '/__foo/',
      otpParam: false,
      connectionMeta: { backend: 'websocket', websocket: { path: '__ws' } },
    })

    // An explicit meta resolves against the client's own base.
    expect(lastWsUrl()).toBe('ws://localhost:5173/__foo/__ws')
  })
})
