import type { StartedServer } from '../../../node/instance-shell'
import type { DevframeDefinition, McpRouteOptions } from '../../../types/devframe'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createDevServer } from '../../dev'

const TOKEN = 'a-high-entropy-test-bearer-token'

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

  async function boot(mcp: boolean | McpRouteOptions = true, def = defineTestDef()): Promise<StartedServer> {
    // `port: 0` lets the OS assign a fresh ephemeral port per test. Without
    // it every test binds the same default port, and since they all share
    // one process, Node's global `fetch()` (undici) pools keep-alive
    // sockets per origin (`http://127.0.0.1:<port>`) — a later test can get
    // handed a stale, already-closed socket left over from an earlier
    // test's (torn-down) server, failing instantly with a socket error, or
    // making that earlier server's `close()` hang until undici's
    // keep-alive timeout releases it.
    server = await createDevServer(def, { host: '127.0.0.1', port: 0, mcp })
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

  // A native MCP client must send a (loopback) Origin so the route's gate —
  // which rejects Origin-less requests — accepts it. `mcp: true` trusts
  // same-machine callers, so no bearer is needed.
  function originTransport(started: StartedServer, headers: Record<string, string> = {}): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(`${started.origin}/__mcp`), {
      requestInit: { headers: { origin: started.origin, ...headers } },
    })
  }

  it('trusts same-machine callers by default (origin only) and lists agent tools', async () => {
    const started = await boot()
    const transport = originTransport(started)
    // Negotiate the 2026-07-28 era via `server/discover`.
    const client = new Client(
      { name: 'test-client', version: '0.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    try {
      await client.connect(transport)
      // Stateless per-request serving: the modern era negotiates no
      // `Mcp-Session-Id` — there is no session to key state on.
      expect(client.getProtocolEra()).toBe('modern')
      expect(transport.sessionId).toBeUndefined()

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

  it('answers a bare GET with 405 (no session lifecycle)', async () => {
    const started = await boot()
    // Stateless serving has no session stream to open — the SDK answers a
    // GET (a 2025 session operation) with `405 Method Not Allowed` rather
    // than falling through to the SPA static catch-all.
    const res = await fetch(`${started.origin}/__mcp`, {
      method: 'GET',
      headers: { accept: 'text/event-stream', origin: started.origin },
    })
    await res.body?.cancel()
    expect(res.status).toBe(405)
  })

  /** An `initialize` POST body for the origin/identity gate tests. */
  function initRequest(started: StartedServer, headers: Record<string, string>): Promise<Response> {
    return fetch(`${started.origin}/__mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '0' } },
      }),
    })
  }

  it('rejects an Origin-less request with 403', async () => {
    const started = await boot()
    // Unlike the WS transport, the MCP route does not allow Origin-less
    // requests — a route-based endpoint would otherwise be reachable by any
    // local process.
    const res = await initRequest(started, {})
    await res.body?.cancel()
    expect(res.status).toBe(403)
  })

  it('rejects a disallowed cross-origin request with 403', async () => {
    const started = await boot()
    const res = await initRequest(started, { origin: 'http://evil.example.com' })
    await res.body?.cancel()
    expect(res.status).toBe(403)
  })

  describe('opt-in bearer (authorization: token)', () => {
    it('accepts a request carrying the correct bearer', async () => {
      const started = await boot({ authorization: TOKEN })
      const client = new Client({ name: 'test-client', version: '0.0.0' }, { versionNegotiation: { mode: 'auto' } })
      const transport = originTransport(started, { authorization: `Bearer ${TOKEN}` })
      try {
        await client.connect(transport)
        const tools = await client.listTools()
        expect(tools.tools.map(t => t.name)).toContain('greet')
      }
      finally {
        await client.close()
      }
    })

    it('rejects an allowed-origin request with no bearer as 401 + WWW-Authenticate', async () => {
      const started = await boot({ authorization: TOKEN })
      const res = await initRequest(started, { origin: started.origin })
      await res.body?.cancel()
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
    })

    it('rejects the wrong bearer as 401', async () => {
      const started = await boot({ authorization: TOKEN })
      const res = await initRequest(started, { origin: started.origin, authorization: 'Bearer not-the-token' })
      await res.body?.cancel()
      expect(res.status).toBe(401)
    })

    it('rejects a malformed / multi-credential Authorization header as 401', async () => {
      const started = await boot({ authorization: TOKEN })
      const res = await initRequest(started, { origin: started.origin, authorization: `Bearer ${TOKEN}, Bearer other` })
      await res.body?.cancel()
      expect(res.status).toBe(401)
    })

    it('runs the origin gate before the bearer (disallowed origin still 403)', async () => {
      const started = await boot({ authorization: TOKEN })
      const res = await initRequest(started, { origin: 'http://evil.example.com', authorization: `Bearer ${TOKEN}` })
      await res.body?.cancel()
      expect(res.status).toBe(403)
    })
  })

  describe('opt-in callback (authorization: fn)', () => {
    it('allows when the callback returns true', async () => {
      const started = await boot({ authorization: req => req.headers.get('x-secret') === 'open-sesame' })
      const res = await initRequest(started, { 'origin': started.origin, 'x-secret': 'open-sesame' })
      expect(res.status).toBe(200)
      await res.body?.cancel()
    })

    it('denies with 401 when the callback returns false', async () => {
      const started = await boot({ authorization: req => req.headers.get('x-secret') === 'open-sesame' })
      const res = await initRequest(started, { 'origin': started.origin, 'x-secret': 'wrong' })
      await res.body?.cancel()
      expect(res.status).toBe(401)
    })

    it('cannot relax the origin gate (disallowed origin still 403)', async () => {
      const started = await boot({ authorization: () => true })
      const res = await initRequest(started, { origin: 'http://evil.example.com' })
      await res.body?.cancel()
      expect(res.status).toBe(403)
    })
  })

  it('explicit authorization: false behaves like the origin-only default', async () => {
    const started = await boot({ authorization: false })
    const res = await initRequest(started, { origin: started.origin })
    expect(res.status).toBe(200)
    await res.body?.cancel()
  })
})
