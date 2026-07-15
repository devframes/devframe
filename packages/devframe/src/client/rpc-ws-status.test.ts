import type { ConnectionMeta } from 'devframe/types'
import type { DevframeClientRpcHost } from './rpc'
import { RpcFunctionsCollectorBase } from 'devframe/rpc'
import { createEventEmitter } from 'devframe/utils/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DevframeConnectionError } from './connection'
import { createWsRpcClientMode } from './rpc-ws'

// A minimal fake WebSocket that lets a test drive the open/close/error events
// the client's status model reacts to. It never delivers a message, so a
// `call()` stays pending until the connection is torn down or times out —
// exactly the "spinner that never resolves" scenario under test.
class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  private listeners: Record<string, ((e: any) => void)[]> = {}

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, cb: (e: any) => void): void {
    (this.listeners[type] ||= []).push(cb)
  }

  removeEventListener(type: string, cb: (e: any) => void): void {
    this.listeners[type] = (this.listeners[type] || []).filter(f => f !== cb)
  }

  send(): void {}
  close(): void {}

  private emit(type: string, e: any): void {
    for (const cb of this.listeners[type] || []) cb(e)
  }

  fireOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    this.emit('open', { type: 'open' })
  }

  fireError(): void {
    this.emit('error', { type: 'error' })
  }

  fireClose(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.emit('close', { type: 'close', code: 1006 })
  }
}

const connectionMeta: ConnectionMeta = {
  backend: 'websocket',
  websocket: { path: '__devframe_ws' },
}

function setup(callTimeout?: number) {
  const events = createEventEmitter<any>()
  const statuses: string[] = []
  events.on('connection:status', (status: string) => statuses.push(status))
  const connectionErrors: Error[] = []
  events.on('connection:error', (error: Error) => connectionErrors.push(error))
  const rpcErrors: Array<{ error: Error, method: string }> = []
  events.on('rpc:error', (error: Error, method: string) => rpcErrors.push({ error, method }))
  const clientRpc = new RpcFunctionsCollectorBase<any, any>({}) as unknown as DevframeClientRpcHost
  const mode = createWsRpcClientMode({
    connectionMeta,
    metaBaseUrl: 'http://localhost:5173/__connection.json',
    events,
    clientRpc,
    callTimeout,
  })
  const ws = FakeWebSocket.instances.at(-1)!
  return { mode, ws, statuses, connectionErrors, rpcErrors }
}

describe('ws client connection status', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    ;(globalThis as any).WebSocket = FakeWebSocket
    ;(globalThis as any).location = {
      protocol: 'http:',
      host: 'localhost:5173',
      hostname: 'localhost',
      href: 'http://localhost:5173/__foo/index.html',
      origin: 'http://localhost:5173',
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).WebSocket
    delete (globalThis as any).location
  })

  it('starts out connecting', () => {
    const { mode } = setup()
    expect(mode.status).toBe('connecting')
    expect(mode.connectionError).toBeNull()
  })

  it('rejects a pending call when the socket closes', async () => {
    const { mode, ws, statuses } = setup()
    const pending = mode.call('demo:method' as any)
    ws.fireOpen()
    ws.fireClose()
    await expect(pending).rejects.toBeInstanceOf(DevframeConnectionError)
    await expect(pending).rejects.toMatchObject({ kind: 'connection' })
    expect(mode.status).toBe('disconnected')
    expect(statuses).toContain('disconnected')
  })

  it('moves to error and rejects pending calls on a socket error', async () => {
    const { mode, ws, connectionErrors } = setup()
    const pending = mode.call('demo:method' as any)
    ws.fireOpen()
    ws.fireError()
    await expect(pending).rejects.toMatchObject({ kind: 'connection' })
    expect(mode.status).toBe('error')
    expect(mode.connectionError).not.toBeNull()
    expect(connectionErrors.length).toBeGreaterThan(0)
  })

  it('fails new calls fast once disconnected instead of hanging', async () => {
    const { mode, ws } = setup()
    ws.fireOpen()
    ws.fireClose()
    await expect(mode.call('demo:method' as any)).rejects.toMatchObject({ kind: 'connection' })
  })

  it('times out a call that never gets a response', async () => {
    const { mode, ws } = setup(30)
    ws.fireOpen()
    await expect(mode.call('demo:method' as any)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('emits rpc:error when a call fails', async () => {
    const { mode, ws, rpcErrors } = setup()
    ws.fireOpen()
    ws.fireClose()
    await mode.call('demo:method' as any).catch(() => {})
    expect(rpcErrors.length).toBeGreaterThan(0)
    expect(rpcErrors[0].error).toBeInstanceOf(DevframeConnectionError)
    expect(rpcErrors[0].method).toBe('demo:method')
  })
})
