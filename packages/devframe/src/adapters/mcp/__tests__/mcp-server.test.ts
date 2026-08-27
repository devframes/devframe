import type { DevframeHost } from '../../../types/host'
import { fileURLToPath } from 'node:url'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { createHostContext } from 'devframe/node'
import { describe, expect, it, vi } from 'vitest'
import { buildMcpServerFromContext } from '../build-server'

function nullHost(): DevframeHost {
  return {
    mountStatic: () => { /* no-op */ },
    resolveOrigin: () => 'mcp://test',
    getStorageDir: () => '/tmp/devframe-test-storage',
  }
}

async function bootPair() {
  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: nullHost() })

  const server = buildMcpServerFromContext(ctx, {
    serverName: 'test',
    serverVersion: '0.0.0-test',
    exposeSharedState: true,
    era: 'legacy',
  })

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await client.connect(clientTransport)

  return {
    ctx,
    client,
    cleanup: async () => {
      await client.close()
      await server.close()
    },
  }
}

describe('mcp adapter (in-memory)', () => {
  it('lists tools registered via ctx.agent.registerTool', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'greet',
        description: 'Say hello.',
        safety: 'read',
        handler: () => ({ greeting: 'hi' }),
      })

      const result = await client.listTools()
      expect(result.tools.map(t => t.name)).toContain('greet')
      const tool = result.tools.find(t => t.name === 'greet')!
      expect(tool.description).toBe('Say hello.')
      expect(tool.annotations?.readOnlyHint).toBe(true)
    }
    finally {
      await cleanup()
    }
  })

  it('converts a registered tool\'s Standard Schema args to JSON Schema over the wire', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      const v = await import('valibot')
      ctx.agent.registerTool({
        id: 'schema-tool',
        description: 'Takes a schema-typed arg.',
        args: [v.object({ name: v.optional(v.string()) })],
        handler: args => args,
      })

      const listed = await client.listTools()
      const tool = listed.tools.find(t => t.name === 'schema-tool')!
      // Each positional arg is advertised under `arg0`/`arg1`/… — the
      // project-wide Standard Schema convention (no single-arg unwrapping).
      const schema = tool.inputSchema as { type: string, properties: Record<string, unknown> }
      expect(schema.type).toBe('object')
      expect(Object.keys(schema.properties)).toEqual(['arg0'])

      // `args` is purely descriptive for a plain registered tool — the
      // handler receives the caller's payload as-is, unlike RPC-backed
      // tools (or hub commands) which coerce `arg0`/`arg1`/… into
      // positional parameters.
      const result = await client.callTool({ name: 'schema-tool', arguments: { arg0: { name: 'devframe' } } })
      const content = result.content as Array<{ type: string, text: string }>
      expect(JSON.parse(content[0]!.text)).toEqual({ arg0: { name: 'devframe' } })
    }
    finally {
      await cleanup()
    }
  })

  it('advertises colon-namespaced ids under their derived wire name and resolves calls back', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'devframes:plugin:demo:greet',
        description: 'Say hello.',
        safety: 'read',
        handler: () => ({ greeting: 'hi' }),
      })

      const listed = await client.listTools()
      const names = listed.tools.map(t => t.name)
      expect(names).toContain('devframes_plugin_demo_greet')
      expect(names).not.toContain('devframes:plugin:demo:greet')

      const result = await client.callTool({ name: 'devframes_plugin_demo_greet', arguments: {} })
      const content = result.content as Array<{ type: string, text: string }>
      expect(JSON.parse(content[0]!.text)).toEqual({ greeting: 'hi' })
    }
    finally {
      await cleanup()
    }
  })

  it('hides a later tool whose wire name collides with an earlier one', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'demo:greet',
        description: 'First.',
        handler: () => 'first',
      })
      ctx.agent.registerTool({
        id: 'demo_greet',
        description: 'Second — sanitizes to the same wire name.',
        handler: () => 'second',
      })

      const listed = await client.listTools()
      const matches = listed.tools.filter(t => t.name === 'demo_greet')
      expect(matches).toHaveLength(1)
      expect(matches[0]!.description).toBe('First.')
    }
    finally {
      await cleanup()
    }
  })

  it('returns text and structured content for a tool with an output schema', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'echo',
        description: 'Echo.',
        outputSchema: {
          type: 'object',
          properties: { echoed: { type: 'object' } },
          required: ['echoed'],
        },
        handler: args => ({ echoed: args }),
      })

      await client.listTools()
      const result = await client.callTool({ name: 'echo', arguments: { foo: 'bar' } })
      const content = result.content as Array<{ type: string, text: string }>
      expect(content[0]!.type).toBe('text')
      expect(JSON.parse(content[0]!.text)).toEqual({ echoed: { foo: 'bar' } })
      expect(result.structuredContent).toEqual({ echoed: { foo: 'bar' } })
    }
    finally {
      await cleanup()
    }
  })

  it('coerces non-JSON values returned from a tool', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'rich',
        description: 'Returns BigInt + Date.',
        handler: () => ({ count: 42n, when: new Date(0) }),
      })

      const result = await client.callTool({ name: 'rich', arguments: {} })
      const content = result.content as Array<{ type: string, text: string }>
      expect(content[0]!.text).toContain('"42n"')
      expect(content[0]!.text).toContain('1970-01-01T00:00:00.000Z')
    }
    finally {
      await cleanup()
    }
  })

  it('surfaces Error name and cause when a tool throws', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'crash',
        description: 'Throws.',
        handler: () => {
          throw new TypeError('boom', { cause: new Error('inner') })
        },
      })

      const result = await client.callTool({ name: 'crash', arguments: {} })
      expect(result.isError).toBe(true)
      const content = result.content as Array<{ type: string, text: string }>
      expect(content[0]!.text).toContain('TypeError: boom')
      expect(content[0]!.text).toContain('cause: inner')
    }
    finally {
      await cleanup()
    }
  })

  it('uses a no-op progress reporter when the caller provides no token', async () => {
    expect.assertions(1)
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'quiet-progress',
        description: 'Report progress without a listening caller.',
        handler: async (_args, invocation) => {
          await invocation?.reportProgress({ progress: 1, message: 'Running' })
          return 'complete'
        },
      })

      const result = await client.callTool({ name: 'quiet-progress', arguments: {} })
      expect((result.content[0] as { text: string }).text).toBe('complete')
    }
    finally {
      await cleanup()
    }
  })

  it('returns DF0071 when tool progress does not increase', async () => {
    expect.assertions(2)
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'invalid-progress',
        description: 'Report invalid progress.',
        handler: async (_args, invocation) => {
          await invocation?.reportProgress({ progress: 1 })
          await invocation?.reportProgress({ progress: 1 })
        },
      })

      const result = await client.callTool(
        { name: 'invalid-progress', arguments: {} },
        { onprogress: () => {} },
      )
      expect(result.isError).toBe(true)
      expect((result.content[0] as { text: string }).text).toContain('DF0071')
    }
    finally {
      await cleanup()
    }
  })

  it('lists and reads registered resources', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerResource({
        id: 'build-status',
        name: 'Build status',
        description: 'Current build status.',
        read: () => ({ json: { status: 'ok' } }),
      })

      const listed = await client.listResources()
      expect(client.getServerCapabilities()?.resources).toEqual({})
      const resource = listed.resources.find(r => r.uri === 'devframe://resource/build-status')
      expect(resource).toBeDefined()
      expect(resource!.name).toBe('Build status')

      const read = await client.readResource({ uri: 'devframe://resource/build-status' })
      const c = read.contents[0] as { text: string, mimeType?: string }
      expect(c.mimeType).toBe('application/json')
      expect(JSON.parse(c.text)).toEqual({ status: 'ok' })
    }
    finally {
      await cleanup()
    }
  })

  it('reads resources from their explicit URI', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      const read = vi.fn((uri: URL) => ({ json: { uri: uri.toString() } }))
      ctx.agent.registerResource({
        id: 'current-build',
        uri: 'https://example.com/build/current',
        name: 'Current build',
        read,
      })

      const listed = await client.listResources()
      expect(listed.resources.map(resource => resource.uri)).toContain('https://example.com/build/current')
      const result = await client.readResource({ uri: 'https://example.com/build/current' })
      const content = result.contents[0] as { text: string }
      expect(JSON.parse(content.text)).toEqual({ uri: 'https://example.com/build/current' })
      expect(read).toHaveBeenCalledWith(new URL('https://example.com/build/current'))
    }
    finally {
      await cleanup()
    }
  })

  it('lists templates and their concrete resources, then parses variables on read', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      const read = vi.fn((uri: URL, variables: Readonly<Record<string, string | string[]>>) => ({
        json: { uri: uri.toString(), variables },
      }))
      ctx.agent.registerResource({
        id: 'logs',
        uriTemplate: 'devframe://logs/{name}',
        name: 'Logs',
        description: 'Logs by process name.',
        mimeType: 'application/json',
        list: () => ({
          resources: [{ uri: 'devframe://logs/app', name: 'App logs', mimeType: 'application/json' }],
        }),
        read,
      })

      const templates = await client.listResourceTemplates()
      expect(templates.resourceTemplates).toContainEqual({
        uriTemplate: 'devframe://logs/{name}',
        name: 'Logs',
        description: 'Logs by process name.',
        mimeType: 'application/json',
      })
      const resources = await client.listResources()
      expect(resources.resources).toContainEqual({
        uri: 'devframe://logs/app',
        name: 'App logs',
        mimeType: 'application/json',
      })

      const result = await client.readResource({ uri: 'devframe://logs/worker' })
      const content = result.contents[0] as { text: string }
      expect(JSON.parse(content.text)).toEqual({
        uri: 'devframe://logs/worker',
        variables: { name: 'worker' },
      })
      expect(read).toHaveBeenCalledWith(new URL('devframe://logs/worker'), { name: 'worker' })
    }
    finally {
      await cleanup()
    }
  })

  it('resolves an exact resource URI before a matching template', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerResource({
        id: 'logs-template',
        uriTemplate: 'devframe://logs/{name}',
        name: 'Logs',
        read: () => ({ text: 'template' }),
      })
      ctx.agent.registerResource({
        id: 'fixed-log',
        uri: 'devframe://logs/app',
        name: 'App log',
        read: () => ({ text: 'fixed' }),
      })

      const result = await client.readResource({ uri: 'devframe://logs/app' })
      const content = result.contents[0] as { text: string }
      expect(content.text).toBe('fixed')
    }
    finally {
      await cleanup()
    }
  })

  it('surfaces shared-state keys as MCP resources', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      const state = await ctx.rpc.sharedState.get('my-plugin:counter', {
        initialValue: { count: 7 },
      })

      const listed = await client.listResources()
      const key = 'my-plugin:counter'
      const encoded = encodeURIComponent(key)
      const resource = listed.resources.find(r => r.uri === `devframe://state/${encoded}`)
      expect(resource).toBeDefined()

      const read = await client.readResource({ uri: `devframe://state/${encoded}` })
      const c = read.contents[0] as { text: string }
      expect(JSON.parse(c.text)).toEqual({ count: 7 })
      // Satisfy linter by touching the state handle.
      expect(state.value()).toEqual({ count: 7 })
    }
    finally {
      await cleanup()
    }
  })

  it('omits non-object output schemas (MCP requires type: "object")', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'void-tool',
        description: 'Returns nothing.',
        // What a valibot `v.void()` returns schema converts to.
        outputSchema: { type: 'null' },
        handler: () => undefined,
      })

      const listed = await client.listTools()
      const tool = listed.tools.find(t => t.name === 'void-tool')!
      expect(tool.outputSchema).toBeUndefined()

      // The call still succeeds with plain text content.
      const result = await client.callTool({ name: 'void-tool', arguments: {} })
      expect(result.isError).toBeFalsy()
      expect(result.structuredContent).toBeUndefined()
    }
    finally {
      await cleanup()
    }
  })

  it('exposes shared state through the built-in devframe_state_read tool', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      await ctx.rpc.sharedState.get('my-plugin:counter', {
        initialValue: { count: 7 },
      })

      const listed = await client.listTools()
      const tool = listed.tools.find(t => t.name === 'devframe_state_read')
      expect(tool).toBeDefined()
      expect(tool!.annotations?.readOnlyHint).toBe(true)

      // No key → key list.
      const keys = await client.callTool({ name: 'devframe_state_read', arguments: {} })
      expect(keys.structuredContent).toEqual({ keys: ['my-plugin:counter'] })

      // With key → the value.
      const value = await client.callTool({ name: 'devframe_state_read', arguments: { key: 'my-plugin:counter' } })
      expect(value.structuredContent).toEqual({ key: 'my-plugin:counter', value: { count: 7 } })

      // Unknown key → agent-actionable error.
      const missing = await client.callTool({ name: 'devframe_state_read', arguments: { key: 'nope' } })
      expect(missing.isError).toBe(true)
      const content = missing.content as Array<{ text: string }>
      expect(content[0]!.text).toContain('Unknown shared-state key')
    }
    finally {
      await cleanup()
    }
  })

  it('hides devframe:state:read when shared-state exposure is disabled', async () => {
    const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: nullHost() })
    const server = buildMcpServerFromContext(ctx, {
      serverName: 'test',
      serverVersion: '0.0.0-test',
      exposeSharedState: false,
      era: 'legacy',
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    await client.connect(clientTransport)
    try {
      const listed = await client.listTools()
      expect(listed.tools.map(t => t.name)).not.toContain('devframe_state_read')
    }
    finally {
      await client.close()
      await server.close()
    }
  })

  it('respects the shared-state filter in devframe:state:read', async () => {
    const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: nullHost() })
    await ctx.rpc.sharedState.get('visible:key', { initialValue: { n: 1 } })
    await ctx.rpc.sharedState.get('hidden:key', { initialValue: { n: 2 } })
    const server = buildMcpServerFromContext(ctx, {
      serverName: 'test',
      serverVersion: '0.0.0-test',
      exposeSharedState: key => key.startsWith('visible:'),
      era: 'legacy',
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'test-client', version: '0.0.0' })
    await client.connect(clientTransport)
    try {
      const keys = await client.callTool({ name: 'devframe_state_read', arguments: {} })
      expect(keys.structuredContent).toEqual({ keys: ['visible:key'] })

      const hidden = await client.callTool({ name: 'devframe_state_read', arguments: { key: 'hidden:key' } })
      expect(hidden.isError).toBe(true)
    }
    finally {
      await client.close()
      await server.close()
    }
  })
})

describe('mcp adapter (stdio)', () => {
  it('delivers request-bound tool progress before the stdio result', async () => {
    expect.assertions(1)
    const fixture = fileURLToPath(new URL('./fixtures/progress-stdio-server.ts', import.meta.url))
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', fixture],
      cwd: process.cwd(),
      stderr: 'pipe',
    })
    const client = new Client(
      { name: 'stdio-progress-test-client', version: '0.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    const events: unknown[] = []

    try {
      await client.connect(transport)
      const result = await client.callTool(
        { name: 'build', arguments: {} },
        { onprogress: progress => events.push({ type: 'progress', ...progress }) },
      )
      events.push({ type: 'result', text: (result.content[0] as { text: string }).text })

      expect(events).toEqual([
        { type: 'progress', progress: 1, total: 2, message: 'Compiling' },
        { type: 'progress', progress: 2, total: 2, message: 'Testing' },
        { type: 'result', text: '{\n  "status": "complete"\n}' },
      ])
    }
    finally {
      await client.close()
    }
  })

  it('lists, reads, and receives modern updates for registered, template, and shared-state resources', async () => {
    const fixture = fileURLToPath(new URL('./fixtures/resource-stdio-server.ts', import.meta.url))
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', fixture],
      cwd: process.cwd(),
      stderr: 'pipe',
    })
    const client = new Client(
      { name: 'stdio-test-client', version: '0.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    let subscription: Awaited<ReturnType<typeof client.listen>> | undefined
    const updates: string[] = []
    client.setNotificationHandler('notifications/resources/updated', (notification) => {
      updates.push(notification.params.uri)
    })

    try {
      await client.connect(transport)
      expect(client.getProtocolEra()).toBe('modern')
      const resources = await client.listResources()
      expect(resources.resources.map(resource => resource.uri)).toEqual(expect.arrayContaining([
        'https://example.com/status',
        'devframe://logs/app',
        'devframe://state/stdio%3Acounter',
      ]))
      const templates = await client.listResourceTemplates()
      expect(templates.resourceTemplates.map(template => template.uriTemplate)).toEqual(['devframe://logs/{name}'])

      const fixed = await client.readResource({ uri: 'https://example.com/status' })
      expect(JSON.parse((fixed.contents[0] as { text: string }).text)).toEqual({
        uri: 'https://example.com/status',
        status: 'ok',
      })
      const template = await client.readResource({ uri: 'devframe://logs/worker' })
      expect(JSON.parse((template.contents[0] as { text: string }).text)).toEqual({ process: 'worker' })

      subscription = await client.listen({
        resourceSubscriptions: [
          'https://example.com/status',
          'devframe://state/stdio%3Acounter',
        ],
      })
      const increment = await client.callTool({ name: 'increment-state', arguments: {} })
      expect(increment.isError).toBeFalsy()
      const updatedState = await client.readResource({ uri: 'devframe://state/stdio%3Acounter' })
      expect(JSON.parse((updatedState.contents[0] as { text: string }).text)).toEqual({ count: 1 })
      await vi.waitFor(() => expect(updates).toEqual(expect.arrayContaining([
        'https://example.com/status',
        'devframe://state/stdio%3Acounter',
      ])))
      expect(updates).not.toContain('devframe://resource/ignored')
    }
    finally {
      await subscription?.close()
      await client.close()
    }
  })
})
