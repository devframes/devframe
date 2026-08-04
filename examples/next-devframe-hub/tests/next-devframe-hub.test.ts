import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { nextDevframeHub } from '../src/client/devframe/next-devframe-hub'

vi.stubGlobal('WebSocket', WebSocket)

function bootRpc(port: number, authToken?: string) {
  const channel = createWsRpcChannel({ url: `ws://127.0.0.1:${port}`, authToken })
  return createRpcClient<any, any>({}, { channel })
}

describe('next-devframe-hub (example)', () => {
  let server: Awaited<ReturnType<typeof nextDevframeHub>> | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  it('returns connection meta pointing at the WS backend, in-process MCP, and a host-injected auth token', async () => {
    server = await nextDevframeHub({ host: '127.0.0.1' })

    expect(server.connectionMeta.backend).toBe('websocket')
    expect(server.connectionMeta.websocket).toBe(server.port)
    expect(server.connectionMeta.mcp).toEqual({ path: '/__hub/__mcp' })
    // The gated side-car hands its own SPA a pre-shared token via the meta.
    expect(server.connectionMeta.authToken).toBeTypeOf('string')
    expect(server.connectionMeta.authToken!.length).toBeGreaterThanOrEqual(32)
  })

  it('rejects a connection that does not present the host auth token', async () => {
    server = await nextDevframeHub({ host: '127.0.0.1' })

    const rpc = bootRpc(server.port)
    await expect(
      rpc.$call('example:next-devframe-hub:messages:list'),
    ).rejects.toThrow()
  })

  it('registers a hub-owned settings dock and the mounted plugin docks', async () => {
    server = await nextDevframeHub({ host: '127.0.0.1' })

    const docks = server.context.docks.values()
    const dockIds = docks.map(d => d.id)
    expect(dockIds).toContain('example:next-demo-tool')
    // The hub synthesizes no built-in docks; the integration registers the
    // settings tab itself, declaring the `~builtin` category explicitly.
    expect(dockIds).toContain('~settings')
    expect(docks.find(d => d.id === '~settings')?.category).toBe('~builtin')
    // The dogfooded built-in plugin packages mount their own docks.
    expect(dockIds).toContain('devframes_plugin_terminals')
    expect(dockIds).toContain('devframes_plugin_messages')
    // The assets plugin is mounted with its dir pointed at Next's public/.
    expect(dockIds).toContain('devframes_plugin_assets')
  })

  it('lists startup and demo messages through the kit-local RPC', async () => {
    server = await nextDevframeHub({ host: '127.0.0.1' })

    const rpc = bootRpc(server.port, server.connectionMeta.authToken)
    const messages = await rpc.$call('example:next-devframe-hub:messages:list') as { message: string }[]
    expect(messages.map(m => m.message)).toContain('Next Devframe Hub started')
    expect(messages.map(m => m.message)).toContain('Next demo devframe loaded')
  })

  it('executes the ping command through the hub command RPC', async () => {
    server = await nextDevframeHub({ host: '127.0.0.1' })

    const rpc = bootRpc(server.port, server.connectionMeta.authToken)
    await expect(
      rpc.$call('hub:commands:execute', 'example:next-devframe-hub:ping'),
    ).resolves.toBe('pong')
  })
})
