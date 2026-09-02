import type { AgentResourceVariables } from '../../../types/agent'
import type { DevframeHost } from '../../../types/host'
import { fileURLToPath } from 'node:url'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { createHostContext } from 'devframe/node'
import { describe, expect, it, vi } from 'vitest'
import { bridgeMcpUpdates, buildMcpServerFromContext } from '../build-server'

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
  }, { listChanged: true })

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
  it('bridges resource and shared-state updates until disposed', async () => {
    expect.assertions(6)
    const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: nullHost() })
    const visibleState = await ctx.rpc.sharedState.get('visible:existing', {
      initialValue: { count: 0 },
    })
    await ctx.rpc.sharedState.get('hidden:existing', {
      initialValue: { count: 0 },
    })
    const toolsChanged = vi.fn()
    const resourcesChanged = vi.fn()
    const resourceUpdated = vi.fn()
    const dispose = bridgeMcpUpdates(ctx, key => key.startsWith('visible:'), {
      toolsChanged,
      resourcesChanged,
      resourceUpdated,
    })
    const resource = ctx.agent.registerResource({
      id: 'status',
      name: 'Status',
      read: () => ({ json: { status: 'ok' } }),
    })

    resource.notifyUpdated()
    visibleState.mutate(value => void (value.count += 1))
    const lateState = await ctx.rpc.sharedState.get('visible:late', {
      initialValue: { count: 0 },
    })
    lateState.mutate(value => void (value.count += 1))
    const hiddenState = await ctx.rpc.sharedState.get('hidden:late', {
      initialValue: { count: 0 },
    })
    hiddenState.mutate(value => void (value.count += 1))
    ctx.rpc.sharedState.delete('visible:late')
    ctx.rpc.sharedState.delete('hidden:late')

    expect(toolsChanged).toHaveBeenCalledOnce()
    expect(resourcesChanged).toHaveBeenCalledTimes(3)
    expect(resourceUpdated.mock.calls).toEqual([
      ['devframe://resource/status'],
      ['devframe://state/visible%3Aexisting'],
      ['devframe://state/visible%3Alate'],
    ])

    dispose()
    resource.notifyUpdated()
    visibleState.mutate(value => void (value.count += 1))
    await ctx.rpc.sharedState.get('visible:after-dispose', {
      initialValue: { count: 0 },
    })
    expect(toolsChanged).toHaveBeenCalledOnce()
    expect(resourcesChanged).toHaveBeenCalledTimes(3)
    expect(resourceUpdated).toHaveBeenCalledTimes(3)
  })

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
    expect.assertions(3)
    const { ctx, client, cleanup } = await bootPair()
    try {
      const read = vi.fn(() => ({ json: { status: 'ok' } }))
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
      expect(JSON.parse(content.text)).toEqual({ status: 'ok' })
      expect(read).toHaveBeenCalledOnce()
    }
    finally {
      await cleanup()
    }
  })

  it('lists URI templates and resolves exact resources before templates in registration order', async () => {
    expect.assertions(10)
    const { ctx, client, cleanup } = await bootPair()
    try {
      const exactRead = vi.fn(() => ({ text: 'exact' }))
      const firstTemplateRead = vi.fn((_uri: URL, _variables: AgentResourceVariables) => ({ text: 'first template' }))
      const secondTemplateRead = vi.fn((_uri: URL, _variables: AgentResourceVariables) => ({ text: 'second template' }))
      const exactUri = 'devframe://resource/artifacts/known/files/output.json'
      ctx.agent.registerResource({
        id: 'known-artifact',
        uri: exactUri,
        name: 'Known artifact',
        read: exactRead,
      })
      ctx.agent.registerResource({
        id: 'artifact-file',
        uriTemplate: 'devframe://resource/artifacts/{artifactId}/files/{path}',
        name: 'Artifact file',
        read: firstTemplateRead,
      })
      ctx.agent.registerResource({
        id: 'fallback-artifact-file',
        uriTemplate: 'devframe://resource/artifacts/{artifactId}/files/{fileName}',
        name: 'Fallback artifact file',
        read: secondTemplateRead,
      })

      const resources = await client.listResources()
      expect(resources.resources.map(resource => resource.uri)).toEqual([exactUri])
      const templates = await client.listResourceTemplates()
      expect(templates.resourceTemplates.map(template => template.name)).toEqual([
        'Artifact file',
        'Fallback artifact file',
      ])

      const exact = await client.readResource({ uri: exactUri })
      expect((exact.contents[0] as { text: string }).text).toBe('exact')
      expect(exactRead).toHaveBeenCalledOnce()
      expect(firstTemplateRead).not.toHaveBeenCalled()

      const dynamicUri = 'devframe://resource/artifacts/42/files/report.json'
      const dynamic = await client.readResource({ uri: dynamicUri })
      expect((dynamic.contents[0] as { text: string }).text).toBe('first template')
      expect(firstTemplateRead).toHaveBeenCalledOnce()
      expect(firstTemplateRead.mock.calls[0]![0]).toEqual(new URL(dynamicUri))
      expect(firstTemplateRead.mock.calls[0]![1]).toEqual({ artifactId: '42', path: 'report.json' })
      expect(secondTemplateRead).not.toHaveBeenCalled()
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
    }, { listChanged: true })
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
    }, { listChanged: true })
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
  it('delivers filtered resource updates through the pinned MCP 2026 instance', async () => {
    expect.assertions(10)
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
      expect(client.getServerCapabilities()?.resources).toEqual({ listChanged: true, subscribe: true })
      const resources = await client.listResources()
      expect(resources.resources.map(resource => resource.uri)).toEqual(expect.arrayContaining([
        'https://example.com/status',
        'devframe://state/stdio%3Acounter',
      ]))

      const fixed = await client.readResource({ uri: 'https://example.com/status' })
      expect(JSON.parse((fixed.contents[0] as { text: string }).text)).toEqual({ status: 'ok' })
      const templates = await client.listResourceTemplates()
      expect(templates.resourceTemplates.map(template => template.uriTemplate)).toEqual([
        'devframe://resource/artifacts/{artifactId}',
      ])
      const artifact = await client.readResource({ uri: 'devframe://resource/artifacts/42' })
      expect(JSON.parse((artifact.contents[0] as { text: string }).text)).toEqual({ artifactId: '42' })

      subscription = await client.listen({
        resourceSubscriptions: [
          'https://example.com/status',
          'devframe://resource/artifacts/42',
          'devframe://state/stdio%3Acounter',
        ],
      })
      const increment = await client.callTool({ name: 'increment-state', arguments: {} })
      expect(increment.isError).toBeFalsy()
      const updatedState = await client.readResource({ uri: 'devframe://state/stdio%3Acounter' })
      expect(JSON.parse((updatedState.contents[0] as { text: string }).text)).toEqual({ count: 1 })
      await vi.waitFor(() => {
        if (updates.length !== 3)
          throw new Error('Waiting for resource update notifications')
      })
      expect(updates).toEqual([
        'devframe://state/stdio%3Acounter',
        'https://example.com/status',
        'devframe://resource/artifacts/42',
      ])
      expect(updates).not.toContain('devframe://resource/ignored')
    }
    finally {
      await subscription?.close()
      await client.close()
    }
  })

  it('keeps MCP 2025 stdio resource access pull-only', async () => {
    expect.assertions(7)
    const fixture = fileURLToPath(new URL('./fixtures/resource-stdio-server.ts', import.meta.url))
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', fixture],
      cwd: process.cwd(),
      stderr: 'pipe',
    })
    const client = new Client({ name: 'mcp-2025-stdio-test-client', version: '0.0.0' })

    try {
      await client.connect(transport)
      expect(client.getProtocolEra()).toBe('legacy')
      expect(client.getServerCapabilities()?.resources).toEqual({ listChanged: true })
      const resources = await client.listResources()
      expect(resources.resources.map(resource => resource.uri)).toEqual(expect.arrayContaining([
        'https://example.com/status',
        'devframe://state/stdio%3Acounter',
      ]))
      const resource = await client.readResource({ uri: 'https://example.com/status' })
      expect(JSON.parse((resource.contents[0] as { text: string }).text)).toEqual({ status: 'ok' })
      const templates = await client.listResourceTemplates()
      expect(templates.resourceTemplates.map(template => template.uriTemplate)).toEqual([
        'devframe://resource/artifacts/{artifactId}',
      ])
      const artifact = await client.readResource({ uri: 'devframe://resource/artifacts/42' })
      expect(JSON.parse((artifact.contents[0] as { text: string }).text)).toEqual({ artifactId: '42' })
      await expect(client.subscribeResource({ uri: 'https://example.com/status' })).rejects.toThrow()
    }
    finally {
      await client.close()
    }
  })
})
