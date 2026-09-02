import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWsRpcChannel } from './ws-client'

// A minimal fake WebSocket: only what `createWsRpcChannel` touches.
class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.OPEN

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  send(): void {}
  close(): void {}
}

describe('createWsRpcChannel', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('close() closes the underlying socket', () => {
    const channel = createWsRpcChannel({ url: 'ws://localhost:5173/__ws' })
    const ws = FakeWebSocket.instances.at(-1)!
    const closeSpy = vi.spyOn(ws, 'close')

    channel.close()

    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})
