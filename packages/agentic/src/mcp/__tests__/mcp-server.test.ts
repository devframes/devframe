import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { DevframeHost, McpContentBlock, McpResourceTemplate } from 'devframe/types'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { withMcpContent } from 'devframe'
import { createHostContext } from 'devframe/node'
import * as v from 'valibot'
import { describe, expect, it, vi } from 'vitest'
import { bridgeListChanged, buildMcpServerFromContext, compileResourceTemplates } from '../build-server'

/** A 1x1 PNG. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

/** A Standard Schema that accepts any value and converts to `jsonSchema`. */
function objectSchema(jsonSchema: Record<string, unknown>): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: () => jsonSchema, output: () => jsonSchema },
    } as StandardSchemaV1['~standard'],
  }
}

function nullHost(): DevframeHost {
  return {
    mountStatic: () => { /* no-op */ },
    resolveOrigin: () => 'mcp://test',
    getStorageDir: () => '/tmp/devframe-test-storage',
  }
}

async function bootPair(
  exposeSharedState: boolean | ((key: string) => boolean) = true,
  { instructions, resourceTemplates }: { instructions?: string, resourceTemplates?: McpResourceTemplate[] } = {},
) {
  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: nullHost() })

  const server = buildMcpServerFromContext(ctx, {
    serverName: 'test',
    serverVersion: '0.0.0-test',
    exposeSharedState,
    instructions,
    resourceTemplates: compileResourceTemplates(resourceTemplates),
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
  it('sends the server instructions in the handshake', async () => {
    const { client, cleanup } = await bootPair(true, { instructions: 'Call greet first.' })
    try {
      expect(client.getInstructions()).toBe('Call greet first.')
    }
    finally {
      await cleanup()
    }
  })

  it('sends no instructions when none are set', async () => {
    const { client, cleanup } = await bootPair()
    try {
      expect(client.getInstructions()).toBeUndefined()
    }
    finally {
      await cleanup()
    }
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
      // Each positional arg is advertised under `arg0`/`arg1`/…, the
      // project-wide Standard Schema convention (no single-arg unwrapping).
      const schema = tool.inputSchema as { type: string, properties: Record<string, unknown> }
      expect(schema.type).toBe('object')
      expect(Object.keys(schema.properties)).toEqual(['arg0'])

      // `args` is purely descriptive for a plain registered tool: the
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
        description: 'Second, sanitizes to the same wire name.',
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

  it('sends the content blocks attached with withMcpContent in place of the JSON text', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'snapshot',
        description: 'Take a snapshot.',
        handler: () => withMcpContent({ markdown: 'A red pixel.' }, [
          { type: 'text', text: 'A red pixel.' },
          { type: 'image', data: PNG_BASE64, mimeType: 'image/png' },
          { type: 'audio', data: 'AAAA', mimeType: 'audio/wav' },
        ]),
      })

      const result = await client.callTool({ name: 'snapshot', arguments: {} })
      expect(result.isError).toBeFalsy()
      expect(result.content).toEqual([
        { type: 'text', text: 'A red pixel.' },
        { type: 'image', data: PNG_BASE64, mimeType: 'image/png' },
        { type: 'audio', data: 'AAAA', mimeType: 'audio/wav' },
      ])
      expect(result.structuredContent).toBeUndefined()
    }
    finally {
      await cleanup()
    }
  })

  it('keeps the plain result as structured content for an rpc-backed tool with an output schema', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.rpc.register({
        name: 'snapshot',
        type: 'query',
        jsonSerializable: true,
        args: [],
        returns: objectSchema({ type: 'object', properties: { markdown: { type: 'string' } }, required: ['markdown'] }),
        agent: { description: 'Take a snapshot.' },
        handler: () => withMcpContent({ markdown: 'A red pixel.' }, [
          { type: 'image', data: PNG_BASE64, mimeType: 'image/png' },
        ]),
      } as never)

      const listed = await client.listTools()
      const tool = listed.tools.find(t => t.name.endsWith('snapshot'))!
      expect(tool.outputSchema).toBeDefined()

      const result = await client.callTool({ name: tool.name, arguments: {} })
      expect(result.isError).toBeFalsy()
      expect(result.content).toEqual([{ type: 'image', data: PNG_BASE64, mimeType: 'image/png' }])
      expect(result.structuredContent).toEqual({ markdown: 'A red pixel.' })
    }
    finally {
      await cleanup()
    }
  })

  it('returns DF0081 when the attached content blocks are invalid', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.agent.registerTool({
        id: 'broken',
        description: 'Returns a bad block.',
        handler: () => withMcpContent({}, [{ type: 'image', data: PNG_BASE64 } as never]),
      })

      const result = await client.callTool({ name: 'broken', arguments: {} })
      expect(result.isError).toBe(true)
      const content = result.content as Array<{ type: string, text: string }>
      expect(content[0]!.text).toContain('DF0081')
    }
    finally {
      await cleanup()
    }
  })

  it('returns DF0081 when the attached content blocks have holes', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      // eslint-disable-next-line unicorn/no-new-array
      const sparse = new Array(2) as McpContentBlock[]
      sparse[1] = { type: 'text', text: 'second' }
      ctx.agent.registerTool({
        id: 'sparse',
        description: 'Returns a sparse block array.',
        handler: () => withMcpContent({}, sparse),
      })

      const result = await client.callTool({ name: 'sparse', arguments: {} })
      expect(result.isError).toBe(true)
      const content = result.content as Array<{ type: string, text: string }>
      expect(content[0]!.text).toContain('DF0081')
    }
    finally {
      await cleanup()
    }
  })

  it('calls an rpc-backed tool whose return schema has no native converter', async () => {
    const { ctx, client, cleanup } = await bootPair()
    try {
      ctx.rpc.register({
        name: 'list-things',
        type: 'query',
        jsonSerializable: true,
        args: [],
        returns: v.array(v.object({ id: v.string() })),
        agent: { description: 'Lists things.' },
        handler: () => [{ id: 'a' }, { id: 'b' }],
      } as never)

      const listed = await client.listTools()
      const tool = listed.tools.find(t => t.name.endsWith('list-things'))
      expect(tool).toBeDefined()
      expect(tool!.outputSchema).toBeUndefined()

      const result = await client.callTool({ name: tool!.name, arguments: {} })
      expect(result.isError).toBeFalsy()
      const content = result.content as Array<{ type: string, text: string }>
      expect(JSON.parse(content[0]!.text)).toEqual([{ id: 'a' }, { id: 'b' }])
      expect(result.structuredContent).toBeUndefined()
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
        /** What a valibot `v.void()` returns schema converts to. */
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
    const { client, cleanup } = await bootPair(false)
    try {
      const listed = await client.listTools()
      expect(listed.tools.map(t => t.name)).not.toContain('devframe_state_read')
    }
    finally {
      await cleanup()
    }
  })

  it('respects the shared-state filter in devframe:state:read', async () => {
    const { ctx, client, cleanup } = await bootPair(key => key.startsWith('visible:'))
    try {
      await ctx.rpc.sharedState.get('visible:key', { initialValue: { n: 1 } })
      await ctx.rpc.sharedState.get('hidden:key', { initialValue: { n: 2 } })

      const keys = await client.callTool({ name: 'devframe_state_read', arguments: {} })
      expect(keys.structuredContent).toEqual({ keys: ['visible:key'] })

      const hidden = await client.callTool({ name: 'devframe_state_read', arguments: { key: 'hidden:key' } })
      expect(hidden.isError).toBe(true)
    }
    finally {
      await cleanup()
    }
  })

  it('omits state resources and rejects a direct URI read when exposure is disabled', async () => {
    const { ctx, client, cleanup } = await bootPair(false)
    try {
      await ctx.rpc.sharedState.get('alpha:key', { initialValue: { n: 1 } })

      const listed = await client.listResources()
      expect(listed.resources.some(r => r.uri.startsWith('devframe://state/'))).toBe(false)

      // A caller that knows the key must not bypass the policy by reading the
      // URI directly.
      await expect(
        client.readResource({ uri: `devframe://state/${encodeURIComponent('alpha:key')}` }),
      ).rejects.toThrow()
    }
    finally {
      await cleanup()
    }
  })

  it('applies the filter to direct URI reads, not only discovery', async () => {
    const { ctx, client, cleanup } = await bootPair(key => key.startsWith('visible:'))
    try {
      await ctx.rpc.sharedState.get('visible:key', { initialValue: { n: 1 } })
      await ctx.rpc.sharedState.get('hidden:key', { initialValue: { n: 2 } })

      const listed = await client.listResources()
      const stateUris = listed.resources.filter(r => r.uri.startsWith('devframe://state/')).map(r => r.uri)
      expect(stateUris).toEqual([`devframe://state/${encodeURIComponent('visible:key')}`])

      const allowed = await client.readResource({ uri: `devframe://state/${encodeURIComponent('visible:key')}` })
      const c = allowed.contents[0] as { text: string }
      expect(JSON.parse(c.text)).toEqual({ n: 1 })

      // Known key, denied by predicate: rejected before storage access.
      await expect(
        client.readResource({ uri: `devframe://state/${encodeURIComponent('hidden:key')}` }),
      ).rejects.toThrow()
    }
    finally {
      await cleanup()
    }
  })

  it('agrees between the state-read tool and the resource path for the same policy', async () => {
    const { ctx, client, cleanup } = await bootPair(key => key.startsWith('visible:'))
    try {
      await ctx.rpc.sharedState.get('visible:key', { initialValue: { n: 1 } })
      await ctx.rpc.sharedState.get('hidden:key', { initialValue: { n: 2 } })

      // Allowed key: both paths return the same value.
      const toolValue = await client.callTool({ name: 'devframe_state_read', arguments: { key: 'visible:key' } })
      expect(toolValue.structuredContent).toEqual({ key: 'visible:key', value: { n: 1 } })
      const resourceValue = await client.readResource({ uri: `devframe://state/${encodeURIComponent('visible:key')}` })
      const c = resourceValue.contents[0] as { text: string }
      expect(JSON.parse(c.text)).toEqual({ n: 1 })

      // Denied key: both paths reject.
      const toolHidden = await client.callTool({ name: 'devframe_state_read', arguments: { key: 'hidden:key' } })
      expect(toolHidden.isError).toBe(true)
      await expect(
        client.readResource({ uri: `devframe://state/${encodeURIComponent('hidden:key')}` }),
      ).rejects.toThrow()
    }
    finally {
      await cleanup()
    }
  })

  describe('resource templates', () => {
    const file: McpResourceTemplate = {
      uriTemplate: 'test://file/{path}',
      name: 'file',
      title: 'Project file',
      description: 'One file of the project.',
      mimeType: 'text/plain',
      list: () => [
        { uri: 'test://file/a.ts', name: 'a.ts' },
        { uri: 'test://file/b.json', name: 'b.json', title: 'B', description: 'The b file.', mimeType: 'application/json' },
      ],
      read: (params, uri) => ({ text: `${params.path} from ${uri}` }),
    }
    const issue: McpResourceTemplate = {
      uriTemplate: 'test://repo/{owner}/{repo}/issue/{id}',
      name: 'issue',
      read: params => ({ json: { ...params } }),
    }

    it('keeps the resources unchanged when templates are omitted or empty', async () => {
      const lists: unknown[] = []
      for (const templates of [undefined, []]) {
        const { ctx, client, cleanup } = await bootPair(true, { resourceTemplates: templates })
        try {
          ctx.agent.registerResource({ id: 'status', name: 'Status', read: () => ({ json: { ok: true } }) })
          await ctx.rpc.sharedState.get('my-plugin:counter', { initialValue: { count: 1 } })
          // The client answers listResourceTemplates() itself when the
          // capability is absent, so send the raw request to check that no
          // handler exists.
          await expect(client.request({ method: 'resources/templates/list', params: {} })).rejects.toMatchObject({ code: -32601 })
          lists.push(await client.listResources())
          await expect(client.readResource({ uri: 'test://file/a.ts' })).rejects.toThrow('unknown resource URI "test://file/a.ts"')
        }
        finally {
          await cleanup()
        }
      }
      expect(lists[1]).toEqual(lists[0])
      expect(lists[0]).toEqual({
        resources: [
          { uri: 'devframe://resource/status', name: 'Status', mimeType: 'application/json' },
          { uri: 'devframe://state/my-plugin%3Acounter', name: 'my-plugin:counter', description: 'Shared state: my-plugin:counter', mimeType: 'application/json' },
        ],
      })
    })

    it('lists the templates through resources/templates/list', async () => {
      const { client, cleanup } = await bootPair(true, { resourceTemplates: [file, issue] })
      try {
        const { resourceTemplates } = await client.listResourceTemplates()
        expect(resourceTemplates).toEqual([
          { uriTemplate: 'test://file/{path}', name: 'file', title: 'Project file', description: 'One file of the project.', mimeType: 'text/plain' },
          { uriTemplate: 'test://repo/{owner}/{repo}/issue/{id}', name: 'issue' },
        ])
      }
      finally {
        await cleanup()
      }
    })

    it('reads a URI through the template it matches', async () => {
      const { client, cleanup } = await bootPair(true, { resourceTemplates: [file, issue] })
      try {
        const a = await client.readResource({ uri: 'test://file/a.ts' })
        expect(a.contents).toEqual([{ uri: 'test://file/a.ts', mimeType: 'text/plain', text: 'a.ts from test://file/a.ts' }])
        const b = await client.readResource({ uri: 'test://file/b.json' })
        expect(b.contents).toEqual([{ uri: 'test://file/b.json', mimeType: 'text/plain', text: 'b.json from test://file/b.json' }])

        const read = await client.readResource({ uri: 'test://repo/devframes/devframe/issue/42' })
        const c = read.contents[0] as { text: string, mimeType?: string }
        expect(c.mimeType).toBe('application/json')
        expect(JSON.parse(c.text)).toEqual({ owner: 'devframes', repo: 'devframe', id: '42' })
      }
      finally {
        await cleanup()
      }
    })

    it('percent-decodes the values', async () => {
      const { client, cleanup } = await bootPair(true, { resourceTemplates: [file] })
      try {
        const read = await client.readResource({ uri: 'test://file/src%2Fmy%20file.ts' })
        expect(read.contents[0]).toMatchObject({ text: 'src/my file.ts from test://file/src%2Fmy%20file.ts' })
      }
      finally {
        await cleanup()
      }
    })

    it('matches one segment per value, so an extra `/` matches no template', async () => {
      const { client, cleanup } = await bootPair(true, { resourceTemplates: [file] })
      try {
        for (const uri of ['test://file/src/a.ts', 'test://file/', 'test://file/%E0%A4%A'])
          await expect(client.readResource({ uri })).rejects.toThrow(`unknown resource URI "${uri}"`)
      }
      finally {
        await cleanup()
      }
    })

    it('reads with the first template that matches', async () => {
      const first: McpResourceTemplate = { uriTemplate: 'test://item/{id}', name: 'first', read: () => ({ text: 'first' }) }
      const second: McpResourceTemplate = { uriTemplate: 'test://item/{key}', name: 'second', read: () => ({ text: 'second' }) }
      const { client, cleanup } = await bootPair(true, { resourceTemplates: [first, second] })
      try {
        const read = await client.readResource({ uri: 'test://item/1' })
        expect(read.contents[0]).toMatchObject({ text: 'first' })
      }
      finally {
        await cleanup()
      }
    })

    it('reads registered resources before the templates', async () => {
      const catchAll: McpResourceTemplate = { uriTemplate: 'devframe://resource/{id}', name: 'catch-all', read: () => ({ text: 'template' }) }
      const { ctx, client, cleanup } = await bootPair(true, { resourceTemplates: [catchAll] })
      try {
        ctx.agent.registerResource({ id: 'status', name: 'Status', read: () => ({ text: 'registered' }) })
        const read = await client.readResource({ uri: 'devframe://resource/status' })
        expect(read.contents[0]).toMatchObject({ text: 'registered' })
      }
      finally {
        await cleanup()
      }
    })

    it('adds the entries of each template list to resources/list', async () => {
      const { ctx, client, cleanup } = await bootPair(false, { resourceTemplates: [file, issue] })
      try {
        ctx.agent.registerResource({ id: 'status', name: 'Status', read: () => ({ json: {} }) })
        const { resources } = await client.listResources()
        expect(resources).toEqual([
          { uri: 'devframe://resource/status', name: 'Status', mimeType: 'application/json' },
          { uri: 'test://file/a.ts', name: 'a.ts', mimeType: 'text/plain' },
          { uri: 'test://file/b.json', name: 'b.json', title: 'B', description: 'The b file.', mimeType: 'application/json' },
        ])
      }
      finally {
        await cleanup()
      }
    })

    it('passes the node context to list and read', async () => {
      const counter: McpResourceTemplate = {
        uriTemplate: 'test://state/{key}',
        name: 'state',
        list: ctx => ctx.rpc.sharedState.keys().map(key => ({ uri: `test://state/${encodeURIComponent(key)}`, name: key })),
        read: async (params, _uri, ctx) => ({ json: (await ctx.rpc.sharedState.get(params.key!)).value() }),
      }
      const { ctx, client, cleanup } = await bootPair(false, { resourceTemplates: [counter] })
      try {
        await ctx.rpc.sharedState.get('my-plugin:counter', { initialValue: { count: 3 } })
        const { resources } = await client.listResources()
        expect(resources.map(r => r.uri)).toEqual(['test://state/my-plugin%3Acounter'])
        const read = await client.readResource({ uri: resources[0]!.uri })
        expect(JSON.parse((read.contents[0] as { text: string }).text)).toEqual({ count: 3 })
      }
      finally {
        await cleanup()
      }
    })

    it('reports a throwing read to the MCP client', async () => {
      const broken: McpResourceTemplate = {
        uriTemplate: 'test://broken/{id}',
        name: 'broken',
        read: () => {
          throw new Error('disk on fire')
        },
      }
      const { client, cleanup } = await bootPair(true, { resourceTemplates: [broken] })
      try {
        await expect(client.readResource({ uri: 'test://broken/1' })).rejects.toThrow('disk on fire')
      }
      finally {
        await cleanup()
      }
    })

    it('throws DF0084 for a template beyond RFC 6570 level 1', () => {
      for (const uriTemplate of ['test://file/{+path}', 'test://search{?q}', 'test://pair/{a,b}', 'test://file/{path*}', 'test://file/{path', 'test://file/path}', 'test://pair/{a}/{a}', 'test://file/{}']) {
        expect(() => compileResourceTemplates([{ uriTemplate, name: 'bad', read: () => ({}) }])).toThrow(expect.objectContaining({ code: 'DF0084' }))
      }
      expect(compileResourceTemplates([{ uriTemplate: 'test://fixed', name: 'fixed', read: () => ({}) }])[0]!.match('test://fixed')).toEqual({})
    })
  })

  describe('onResourcesChanged', () => {
    it('sends resources list_changed on each notify, and unsubscribes on teardown', async () => {
      const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: nullHost() })
      const server = buildMcpServerFromContext(ctx, { serverName: 'test', serverVersion: '0.0.0-test', exposeSharedState: true })
      let notify: (() => void) | undefined
      const unsubscribe = vi.fn()
      const hook = vi.fn((n: () => void) => {
        notify = n
        return unsubscribe
      })
      // The same wiring as `createMcpServer` uses for stdio.
      const unbridge = bridgeListChanged(ctx, {
        tools: () => { void server.sendToolListChanged().catch(() => {}) },
        resources: () => { void server.sendResourceListChanged().catch(() => {}) },
      }, hook)
      expect(hook).toHaveBeenCalledWith(expect.any(Function), ctx)

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await server.connect(serverTransport)
      const client = new Client({ name: 'test-client', version: '0.0.0' })
      const changed = vi.fn()
      client.setNotificationHandler('notifications/resources/list_changed', changed)
      await client.connect(clientTransport)
      try {
        notify!()
        await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1))

        unbridge()
        expect(unsubscribe).toHaveBeenCalledTimes(1)
        notify!()
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(changed).toHaveBeenCalledTimes(1)
      }
      finally {
        await client.close()
        await server.close()
      }
    })
  })
})
