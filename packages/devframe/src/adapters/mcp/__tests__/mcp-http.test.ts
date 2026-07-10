import type { StartedServer } from '../../../node/server'
import type { DevframeDefinition } from '../../../types/devframe'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createDevServer } from '../../dev'

function defineTestDef(overrides?: Partial<DevframeDefinition>): DevframeDefinition {
  return {
    id: 'mcp-http-test',
    name: 'MCP HTTP Test',
    version: '1.2.3',
    packageName: '@devframe/mcp-http-test',
    homepage: 'https://example.com',
    description: 'Test fixture for the route-based MCP server.',
    setup(ctx) {
      ctx.agent.registerTool({
        id: 'greet',
        description: 'Say hello.',
        safety: 'read',
        handler: (args: { name?: string }) => ({ greeting: `hi ${args.name ?? 'there'}` }),
      })
    },
    ...overrides,
  }
}

describe('mcp adapter (streamable http route)', () => {
  let server: StartedServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  async function boot(def = defineTestDef()): Promise<StartedServer> {
    // `port: 0` lets the OS assign a fresh ephemeral port per test. Without
    // it every test binds the same default port, and since they all share
    // one process, Node's global `fetch()` (undici) pools keep-alive
    // sockets per origin (`http://127.0.0.1:<port>`) — a later test can get
    // handed a stale, already-closed socket left over from an earlier
    // test's (torn-down) server, failing instantly with a socket error, or
    // making that earlier server's `close()` hang until undici's
    // keep-alive timeout releases it.
    server = await createDevServer(def, { host: '127.0.0.1', port: 0, mcp: true })
    return server
  }

  it('advertises the mcp endpoint in __connection.json', async () => {
    const started = await boot()
    const res = await fetch(`${started.origin}/__connection.json`)
    const meta = await res.json() as { backend: string, mcp?: { path: string } }
    expect(meta.backend).toBe('websocket')
    expect(meta.mcp).toEqual({ path: '__mcp' })
  })

  it('omits the mcp block when the route is disabled', async () => {
    server = await createDevServer(defineTestDef(), { host: '127.0.0.1', port: 0, mcp: false })
    const res = await fetch(`${server.origin}/__connection.json`)
    const meta = await res.json() as { mcp?: unknown }
    expect(meta.mcp).toBeUndefined()
  })

  it('establishes a stateful session and lists agent tools', async () => {
    const started = await boot()
    const transport = new StreamableHTTPClientTransport(new URL(`${started.origin}/__mcp`))
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    try {
      await client.connect(transport)
      // Stateful mode issues an Mcp-Session-Id on initialize.
      expect(transport.sessionId).toBeTypeOf('string')
      expect(transport.sessionId!.length).toBeGreaterThan(0)

      const tools = await client.listTools()
      expect(tools.tools.map(t => t.name)).toContain('greet')

      const result = await client.callTool({ name: 'greet', arguments: { name: 'devframe' } })
      const content = result.content as Array<{ type: string, text: string }>
      expect(JSON.parse(content[0]!.text)).toEqual({ greeting: 'hi devframe' })
    }
    finally {
      await client.close()
    }
  })

  it('tears the session down on DELETE and rejects reuse of the id', async () => {
    const started = await boot()
    const url = `${started.origin}/__mcp`

    // Initialize over raw HTTP to capture the issued session id from the
    // response header (the body is an SSE stream we can discard).
    const init = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '0' } },
      }),
    })
    const sessionId = init.headers.get('mcp-session-id')
    await init.body?.cancel()
    expect(sessionId).toBeTruthy()

    // DELETE ends the session.
    const del = await fetch(url, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId! },
    })
    await del.body?.cancel()
    expect(del.status).toBeLessThan(300)

    // Reusing the terminated id is no longer a known session — the server
    // answers 404 rather than falling through to the SPA static catch-all.
    const stale = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })
    await stale.body?.cancel()
    expect(stale.status).toBe(404)
  })

  it('rejects a disallowed cross-origin request', async () => {
    const started = await boot()
    const res = await fetch(`${started.origin}/__mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        'origin': 'http://evil.example.com',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '0' } },
      }),
    })
    expect(res.status).toBe(403)
  })
})
