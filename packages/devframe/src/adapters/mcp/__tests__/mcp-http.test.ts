import type { StartedServer } from '../../../node/instance-shell'
import type { AgentResourceVariables } from '../../../types/agent'
import type { DevframeDefinition } from '../../../types/devframe'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  // A native MCP client must send a (loopback) Origin so the route's gate —
  // which rejects Origin-less requests — accepts it.
  function originTransport(
    started: StartedServer,
    onRequest?: (request: Request) => void | Promise<void>,
  ): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(new URL(`${started.origin}/__mcp`), {
      requestInit: { headers: { origin: started.origin } },
      ...(onRequest
        ? {
            fetch: async (input, init) => {
              const request = new Request(input, init)
              await onRequest(request.clone())
              return fetch(request)
            },
          }
        : {}),
    })
  }

  it('serves MCP 2026 statelessly and lists agent tools', async () => {
    expect.assertions(5)
    const started = await boot()
    const transport = originTransport(started)
    // Negotiate MCP 2026-07-28 via `server/discover`.
    const client = new Client(
      { name: 'test-client', version: '0.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    try {
      await client.connect(transport)
      // Stateless per-request serving: MCP 2026 negotiates no
      // `Mcp-Session-Id` — there is no session to key state on.
      expect(client.getProtocolEra()).toBe('modern')
      expect(transport.sessionId).toBeUndefined()
      expect(client.getServerCapabilities()?.resources).toEqual({ listChanged: true, subscribe: true })

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

  it('delivers filtered resource updates through an MCP 2026 streaming POST', async () => {
    expect.assertions(3)
    let notifyBuildUpdated!: () => void
    let notifyArtifactUpdated!: () => void
    let notifyIgnoredUpdated!: () => void
    let updateExistingState!: () => void
    let createAndUpdateLateState!: () => Promise<void>
    let removeLateState!: () => void
    const started = await boot(defineTestDef({
      async setup(ctx) {
        const build = ctx.agent.registerResource({
          id: 'build',
          name: 'Build',
          read: () => ({ json: { status: 'ok' } }),
        })
        const ignored = ctx.agent.registerResource({
          id: 'ignored',
          name: 'Ignored',
          read: () => ({ json: { ignored: true } }),
        })
        const artifact = ctx.agent.registerResource({
          id: 'artifact',
          uriTemplate: 'devframe://resource/artifacts/{artifactId}',
          name: 'Artifact',
          read: (_uri: URL, variables: AgentResourceVariables) => ({ json: variables }),
        })
        const existingState = await ctx.rpc.sharedState.get('build:status', {
          initialValue: { revision: 0 },
        })
        notifyBuildUpdated = build.notifyUpdated
        notifyArtifactUpdated = () => artifact.notifyUpdated('devframe://resource/artifacts/42')
        notifyIgnoredUpdated = ignored.notifyUpdated
        updateExistingState = () => existingState.mutate(value => void (value.revision += 1))
        createAndUpdateLateState = async () => {
          const lateState = await ctx.rpc.sharedState.get('build:late', {
            initialValue: { revision: 0 },
          })
          lateState.mutate(value => void (value.revision += 1))
        }
        removeLateState = () => {
          ctx.rpc.sharedState.delete('build:late')
        }
      },
    }))
    const client = new Client(
      { name: 'test-client', version: '0.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    const updates: string[] = []
    let resourceListChanges = 0
    const listenRequestMethods: string[] = []
    client.setNotificationHandler('notifications/resources/updated', (notification) => {
      updates.push(notification.params.uri)
    })
    client.setNotificationHandler('notifications/resources/list_changed', () => {
      resourceListChanges += 1
    })

    await client.connect(originTransport(started, async (request) => {
      const body = await request.json().catch(() => undefined) as { method?: string } | undefined
      if (body?.method === 'subscriptions/listen')
        listenRequestMethods.push(request.method)
    }))
    const subscription = await client.listen({
      resourcesListChanged: true,
      resourceSubscriptions: [
        'devframe://resource/build',
        'devframe://resource/artifacts/42',
        'devframe://state/build%3Astatus',
        'devframe://state/build%3Alate',
      ],
    })
    try {
      notifyIgnoredUpdated()
      notifyBuildUpdated()
      notifyArtifactUpdated()
      updateExistingState()
      await createAndUpdateLateState()
      removeLateState()

      await vi.waitFor(() => {
        if (updates.length !== 4 || resourceListChanges !== 2)
          throw new Error('Waiting for resource update and list-change notifications')
      })
      expect(listenRequestMethods).toEqual(['POST'])
      expect(updates).toEqual([
        'devframe://resource/build',
        'devframe://resource/artifacts/42',
        'devframe://state/build%3Astatus',
        'devframe://state/build%3Alate',
      ])
      expect(resourceListChanges).toBe(2)
    }
    finally {
      await subscription.close()
      await client.close()
    }
  })

  it('keeps MCP 2025 HTTP resource access pull-only', async () => {
    expect.assertions(7)
    const started = await boot(defineTestDef({
      setup(ctx) {
        ctx.agent.registerResource({
          id: 'build',
          name: 'Build',
          read: () => ({ json: { status: 'ok' } }),
        })
        ctx.agent.registerResource({
          id: 'artifact',
          uriTemplate: 'devframe://resource/artifacts/{artifactId}',
          name: 'Artifact',
          read: (_uri: URL, variables: AgentResourceVariables) => ({ json: variables }),
        })
      },
    }))
    const client = new Client({ name: 'mcp-2025-test-client', version: '0.0.0' })
    try {
      await client.connect(originTransport(started))
      expect(client.getProtocolEra()).toBe('legacy')
      expect(client.getServerCapabilities()?.resources).toEqual({ listChanged: true })

      const resources = await client.listResources()
      expect(resources.resources.map(resource => resource.uri)).toContain('devframe://resource/build')
      const templates = await client.listResourceTemplates()
      expect(templates.resourceTemplates.map(template => template.uriTemplate)).toEqual([
        'devframe://resource/artifacts/{artifactId}',
      ])
      const result = await client.readResource({ uri: 'devframe://resource/build' })
      expect(JSON.parse((result.contents[0] as { text: string }).text)).toEqual({ status: 'ok' })
      const artifact = await client.readResource({ uri: 'devframe://resource/artifacts/42' })
      expect(JSON.parse((artifact.contents[0] as { text: string }).text)).toEqual({ artifactId: '42' })
      await expect(client.subscribeResource({ uri: 'devframe://resource/build' })).rejects.toThrow()
    }
    finally {
      await client.close()
    }
  })

  it('can disable implicit shared-state MCP exposure for the HTTP route', async () => {
    expect.assertions(2)
    server = await createDevServer(defineTestDef({
      async setup(ctx) {
        await ctx.rpc.sharedState.get('hidden:state', { initialValue: { value: true } })
      },
    }), {
      host: '127.0.0.1',
      port: 0,
      mcp: { exposeSharedState: false },
    })
    const client = new Client(
      { name: 'test-client', version: '0.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    try {
      await client.connect(originTransport(server))
      const resources = await client.listResources()
      const tools = await client.listTools()
      expect(resources.resources).toEqual([])
      expect(tools.tools.map(tool => tool.name)).not.toContain('devframe_state_read')
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

  it('rejects an Origin-less request', async () => {
    const started = await boot()
    // Unlike the WS transport, the MCP route does not allow Origin-less
    // requests — a route-based endpoint would otherwise be reachable by any
    // local process.
    const res = await fetch(`${started.origin}/__mcp`, {
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
    await res.body?.cancel()
    expect(res.status).toBe(403)
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
