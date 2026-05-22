import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { minimalNextDevframeHub } from '../src/client/devframe/minimal-next-devframe-hub'

vi.stubGlobal('WebSocket', WebSocket)

function bootRpc(port: number) {
  const channel = createWsRpcChannel({ url: `ws://127.0.0.1:${port}` })
  return createRpcClient<any, any>({}, { channel })
}

describe('minimal-next-devframe-hub (example)', () => {
  let server: Awaited<ReturnType<typeof minimalNextDevframeHub>> | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  it('returns connection meta pointing at the WS backend', async () => {
    server = await minimalNextDevframeHub({ host: '127.0.0.1' })

    expect(server.connectionMeta).toEqual({
      backend: 'websocket',
      websocket: server.port,
    })
  })

  it('registers hub built-in docks and the mounted demo devframe', async () => {
    server = await minimalNextDevframeHub({ host: '127.0.0.1' })

    const dockIds = server.context.docks.values().map(d => d.id)
    expect(dockIds).toContain('next-demo-tool')
    expect(dockIds).toContain('~terminals')
    expect(dockIds).toContain('~messages')
    expect(dockIds).toContain('~settings')
  })

  it('lists startup and demo messages through the kit-local RPC', async () => {
    server = await minimalNextDevframeHub({ host: '127.0.0.1' })

    const rpc = bootRpc(server.port)
    const messages = await rpc.$call('minimal-next-devframe-hub:messages:list') as { message: string }[]
    expect(messages.map(m => m.message)).toContain('Minimal Next Devframe Hub started')
    expect(messages.map(m => m.message)).toContain('Next demo devframe loaded')
  })

  it('executes the ping command through the hub command RPC', async () => {
    server = await minimalNextDevframeHub({ host: '127.0.0.1' })

    const rpc = bootRpc(server.port)
    await expect(
      rpc.$call('hub:commands:execute', 'minimal-next-devframe-hub:ping'),
    ).resolves.toBe('pong')
  })
})
