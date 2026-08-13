import type { HubInstance } from '@devframes/hub/initiate'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { getPort } from 'get-port-please'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { nextDevframeHub } from '../src/client/devframe/next-devframe-hub'

vi.stubGlobal('WebSocket', WebSocket)

/** The side-car WS port advertised by the hub's connection meta. */
function wsPortOf(hub: HubInstance): number {
  const ws = hub.connectionMeta().websocket
  if (typeof ws === 'object' && typeof ws.port === 'number')
    return ws.port
  throw new Error('expected a side-car websocket meta with a port')
}

function bootRpc(hub: HubInstance) {
  const channel = createWsRpcChannel({ url: `ws://127.0.0.1:${wsPortOf(hub)}/__ws` })
  return createRpcClient<any, any>({}, { channel })
}

describe('next-devframe-hub (example)', () => {
  let hub: HubInstance | undefined

  afterEach(async () => {
    await hub?.close()
    hub = undefined
  })

  it('returns connection meta pointing at the side-car WS and the aggregate MCP', async () => {
    const port = await getPort({ host: '127.0.0.1', port: 19310 })
    hub = await nextDevframeHub({ host: '127.0.0.1', port })
    await hub.ready

    expect(hub.connectionMeta()).toEqual({
      backend: 'websocket',
      websocket: { port, path: '__ws' },
      sse: { path: '/__devframes/__sse' },
      mcp: { path: '__mcp' },
    })
  })

  it('serves hub discovery and every frame under the one /__devframes/ namespace', async () => {
    hub = await nextDevframeHub({ host: '127.0.0.1' })
    await hub.ready

    const origin = 'http://127.0.0.1:3000'
    const meta = await (await hub.handler(new Request(`${origin}/__devframes/__connection.json`))).json()
    expect(meta.websocket).toEqual({ port: wsPortOf(hub), path: '__ws' })

    const index = await (await hub.handler(new Request(`${origin}/__devframes/__index.json`))).json()
    expect(index.base).toBe('/__devframes/')
    const frameIds = index.frames.map((f: { id: string }) => f.id)
    expect(frameIds).toContain('next-demo-tool')
    expect(frameIds).toContain('next-tabbed-tool')

    // Each frame's SPA and its discovery meta live at `<base><id>/`.
    const spa = await hub.handler(new Request(`${origin}/__devframes/next-demo-tool/`))
    expect(await spa.text()).toContain('Next Demo Tool')
    const frameMeta = await (await hub.handler(new Request(`${origin}/__devframes/next-demo-tool/__connection.json`))).json()
    expect(frameMeta.websocket).toEqual({ port: wsPortOf(hub), path: '__ws' })
  })

  it('registers a hub-owned settings dock and the mounted plugin docks', async () => {
    hub = await nextDevframeHub({ host: '127.0.0.1' })
    const ctx = await hub.context

    const docks = ctx.docks.values()
    const dockIds = docks.map(d => d.id)
    expect(dockIds).toContain('next-demo-tool')
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
    hub = await nextDevframeHub({ host: '127.0.0.1' })
    await hub.ready

    const rpc = bootRpc(hub)
    const messages = await rpc.$call('example:next-devframe-hub:messages:list') as { message: string }[]
    expect(messages.map(m => m.message)).toContain('Next Devframe Hub started')
    expect(messages.map(m => m.message)).toContain('Next demo devframe loaded')
  })

  it('executes the ping command through the hub command RPC', async () => {
    hub = await nextDevframeHub({ host: '127.0.0.1' })
    await hub.ready

    const rpc = bootRpc(hub)
    await expect(
      rpc.$call('hub:commands:execute', 'example:next-devframe-hub:ping'),
    ).resolves.toBe('pong')
  })
})
