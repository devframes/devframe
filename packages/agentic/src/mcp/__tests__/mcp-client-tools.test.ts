import type { StartedServer } from 'devframe/internal'
import type { DevframeDefinition, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from 'devframe/types'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createDevServer } from 'devframe/adapters/dev'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import { afterEach, describe, expect, it } from 'vitest'

const definition: DevframeDefinition = {
  id: 'client-tools-test',
  name: 'Client Tools Test',
  version: '0.0.0',
  packageName: '@devframe/client-tools-test',
  homepage: 'https://example.com',
  description: 'Fixture: a devframe whose only agent tools live in browser tabs.',
  setup() {},
}

/** A browser tab: one RPC connection exposing `page:selection` and answering with its own id. */
function connectTab(origin: string, client: { id: string, focused: boolean, visible?: boolean }) {
  const clientFunctions = {
    'devframe:agent:invoke-client-tool': async (id: string, args: Record<string, unknown>) => ({ tab: client.id, tool: id, args }),
  }
  const rpc = createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(
    clientFunctions as any,
    { channel: createWsRpcChannel({ url: `${origin.replace('http', 'ws')}/__ws` }) },
  )
  const sync = (focused = client.focused) => rpc.$call(
    'devframe:agent:sync-client-tools',
    client.id,
    [{ id: 'page:selection', description: 'Read the selection.', safety: 'read', inputSchema: { type: 'object', properties: {} } }],
    { url: `http://app.local/${client.id}`, title: client.id, visible: client.visible ?? true, focused },
  )
  return { rpc, sync }
}

describe('client tools over the MCP route', () => {
  let server: StartedServer | undefined
  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  it('lists connected tabs and routes calls per tab', async () => {
    server = await createDevServer(definition, { host: '127.0.0.1', port: 0, auth: false, mcp: true })
    const a = connectTab(server.origin, { id: 'tab-a', focused: false })
    const b = connectTab(server.origin, { id: 'tab-b', focused: true })
    await a.sync()
    await b.sync()

    const mcp = new Client({ name: 'test', version: '0.0.0' }, { versionNegotiation: { mode: 'auto' } })
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${server.origin}/__mcp`), {
      requestInit: { headers: { origin: server.origin } },
    }))
    try {
      const { tools } = await mcp.listTools()
      const names = tools.map(t => t.name)
      expect(names).toContain('devframe_agent_list-clients')
      expect(names.filter(n => n === 'page_selection')).toHaveLength(1)
      expect((tools.find(t => t.name === 'page_selection')!.inputSchema as any).properties.client_id).toMatchObject({ type: 'string' })

      const listed = await mcp.callTool({ name: 'devframe_agent_list-clients', arguments: {} })
      expect(listed.structuredContent).toEqual({
        clients: [
          expect.objectContaining({ id: 'tab-a', url: 'http://app.local/tab-a', focused: false, tools: ['page:selection'] }),
          expect.objectContaining({ id: 'tab-b', focused: true, tools: ['page:selection'] }),
        ],
      })

      const unaddressed = await mcp.callTool({ name: 'page_selection', arguments: {} })
      expect(JSON.parse((unaddressed.content as any)[0].text)).toMatchObject({ tab: 'tab-b', args: {} })

      const addressed = await mcp.callTool({ name: 'page_selection', arguments: { client_id: 'tab-a' } })
      expect(JSON.parse((addressed.content as any)[0].text)).toMatchObject({ tab: 'tab-a', args: {} })

      const missing = await mcp.callTool({ name: 'page_selection', arguments: { client_id: 'gone' } })
      expect(missing.isError).toBe(true)
      expect((missing.content as any)[0].text).toMatch(/DF0081.*tab-a, tab-b/s)

      // Focus moves to a: unaddressed calls follow it.
      await a.sync(true)
      const refocused = await mcp.callTool({ name: 'page_selection', arguments: {} })
      expect(JSON.parse((refocused.content as any)[0].text)).toMatchObject({ tab: 'tab-a' })
    }
    finally {
      await mcp.close()
    }
  })
})
