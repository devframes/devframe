import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { minimalNextDevToolsHub } from '../src/client/devtools/minimal-next-devtools-hub'

vi.stubGlobal('WebSocket', WebSocket)

function bootRpc(port: number) {
  const channel = createWsRpcChannel({ url: `ws://127.0.0.1:${port}` })
  return createRpcClient<any, any>({}, { channel })
}

describe('minimal-next-devtools-hub (example)', () => {
  let server: Awaited<ReturnType<typeof minimalNextDevToolsHub>> | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  it('returns connection meta pointing at the WS backend', async () => {
    server = await minimalNextDevToolsHub({ host: '127.0.0.1' })

    expect(server.connectionMeta).toEqual({
      backend: 'websocket',
      websocket: server.port,
    })
  })

  it('registers hub built-in docks and the mounted demo devframe', async () => {
    server = await minimalNextDevToolsHub({ host: '127.0.0.1' })

    const dockIds = server.context.docks.values().map(d => d.id)
    expect(dockIds).toContain('next-demo-tool')
    expect(dockIds).toContain('~terminals')
    expect(dockIds).toContain('~messages')
    expect(dockIds).toContain('~settings')
  })

  it('lists startup and demo messages through the kit-local RPC', async () => {
    server = await minimalNextDevToolsHub({ host: '127.0.0.1' })

    const rpc = bootRpc(server.port)
    const messages = await rpc.$call('minimal-next-devtools-hub:messages:list') as { message: string }[]
    expect(messages.map(m => m.message)).toContain('Minimal Next DevTools Hub started')
    expect(messages.map(m => m.message)).toContain('Next demo devframe loaded')
  })

  it('executes the ping command through the hub command RPC', async () => {
    server = await minimalNextDevToolsHub({ host: '127.0.0.1' })

    const rpc = bootRpc(server.port)
    await expect(
      rpc.$call('hub:commands:execute', 'minimal-next-devtools-hub:ping'),
    ).resolves.toBe('pong')
  })
})
