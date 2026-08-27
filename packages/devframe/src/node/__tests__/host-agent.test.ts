import type { RpcFunctionDefinitionAnyWithContext } from '../../rpc/types'
import type { DevframeNodeContext } from '../../types/context'
import { describe, expect, it, vi } from 'vitest'
import { DevframeAgentHost } from '../host-agent'
import { RpcFunctionsHostImpl } from '../host-functions'

function createContext(): DevframeNodeContext {
  const ctx = {} as DevframeNodeContext
  ctx.rpc = new RpcFunctionsHostImpl(ctx)
  ctx.agent = new DevframeAgentHost(ctx)
  return ctx
}

function rpcDef(def: RpcFunctionDefinitionAnyWithContext<DevframeNodeContext>): RpcFunctionDefinitionAnyWithContext<DevframeNodeContext> {
  return def
}

describe('devToolsAgentHost', () => {
  describe('registerTool()', () => {
    it('stores a tool and exposes it via list()', () => {
      const ctx = createContext()
      const handler = vi.fn(async () => 'result')
      ctx.agent.registerTool({
        id: 'my-tool',
        description: 'Does a thing.',
        handler,
      })

      const tools = ctx.agent.list().tools
      expect(tools).toHaveLength(1)
      expect(tools[0]).toMatchObject({
        id: 'my-tool',
        kind: 'tool',
        title: 'my-tool',
        description: 'Does a thing.',
        safety: 'action',
      })
    })

    it('emits agent:tool:registered and agent:manifest:changed', () => {
      const ctx = createContext()
      const toolHandler = vi.fn()
      const manifestHandler = vi.fn()
      ctx.agent.events.on('agent:tool:registered', toolHandler)
      ctx.agent.events.on('agent:manifest:changed', manifestHandler)

      ctx.agent.registerTool({
        id: 'my-tool',
        description: 'Does a thing.',
        handler: async () => 'ok',
      })

      expect(toolHandler).toHaveBeenCalledOnce()
      expect(manifestHandler).toHaveBeenCalledOnce()
    })

    it('throws DF0014 on empty description', () => {
      const ctx = createContext()
      expect(() => ctx.agent.registerTool({
        id: 'bad-tool',
        description: '',
        handler: async () => {},
      })).toThrow(/bad-tool/)
    })

    it('throws DF0015 on duplicate id', () => {
      const ctx = createContext()
      ctx.agent.registerTool({
        id: 'dup',
        description: 'First.',
        handler: async () => {},
      })
      expect(() => ctx.agent.registerTool({
        id: 'dup',
        description: 'Second.',
        handler: async () => {},
      })).toThrow(/already registered/)
    })

    it('throws DF0015 when colliding with an agent-exposed RPC', () => {
      const ctx = createContext()
      ctx.rpc.register(rpcDef({
        name: 'shared-id',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'An RPC' },
        setup: () => ({ handler: async () => 'rpc' }),
      }))

      expect(() => ctx.agent.registerTool({
        id: 'shared-id',
        description: 'Tool',
        handler: async () => {},
      })).toThrow(/already registered/)
    })

    it('unregister removes the tool and emits events', () => {
      const ctx = createContext()
      const unregisterHandler = vi.fn()
      ctx.agent.events.on('agent:tool:unregistered', unregisterHandler)

      const handle = ctx.agent.registerTool({
        id: 'ephemeral',
        description: 'Goes away.',
        handler: async () => {},
      })
      handle.unregister()

      expect(ctx.agent.list().tools).toHaveLength(0)
      expect(unregisterHandler).toHaveBeenCalledWith('ephemeral')
    })
  })

  describe('list() RPC auto-discovery', () => {
    it('surfaces RPC functions flagged with agent as tools', () => {
      const ctx = createContext()
      ctx.rpc.register(rpcDef({
        name: 'exposed-rpc',
        type: 'query',
        jsonSerializable: true,
        agent: {
          description: 'An exposed RPC.',
          title: 'Exposed',
        },
        setup: () => ({ handler: async () => 42 }),
      }))

      const tools = ctx.agent.list().tools
      expect(tools).toHaveLength(1)
      expect(tools[0]).toMatchObject({
        id: 'exposed-rpc',
        kind: 'rpc',
        title: 'Exposed',
        description: 'An exposed RPC.',
        safety: 'read',
        rpcName: 'exposed-rpc',
      })
    })

    it('does not surface RPC functions without agent field', () => {
      const ctx = createContext()
      ctx.rpc.register(rpcDef({
        name: 'private-rpc',
        type: 'query',
        setup: () => ({ handler: async () => 42 }),
      }))

      expect(ctx.agent.list().tools).toHaveLength(0)
    })

    it('infers safety from RPC type', () => {
      const ctx = createContext()
      ctx.rpc.register(rpcDef({
        name: 'q',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'q' },
        setup: () => ({ handler: async () => {} }),
      }))
      ctx.rpc.register(rpcDef({
        name: 'a',
        type: 'action',
        jsonSerializable: true,
        agent: { description: 'a' },
        setup: () => ({ handler: async () => {} }),
      }))
      ctx.rpc.register(rpcDef({
        name: 's',
        type: 'static',
        jsonSerializable: true,
        agent: { description: 's' },
        setup: () => ({ handler: async () => {} }),
      }))

      const tools = ctx.agent.list().tools
      const byId = Object.fromEntries(tools.map(t => [t.id, t]))
      expect(byId.q!.safety).toBe('read')
      expect(byId.a!.safety).toBe('action')
      expect(byId.s!.safety).toBe('read')
    })

    it('fires manifest:changed when a new agent RPC is registered', () => {
      const ctx = createContext()
      const handler = vi.fn()
      ctx.agent.events.on('agent:manifest:changed', handler)

      ctx.rpc.register(rpcDef({
        name: 'x',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'x' },
        setup: () => ({ handler: async () => {} }),
      }))

      expect(handler).toHaveBeenCalled()
    })
  })

  describe('invoke()', () => {
    it('dispatches to the registered tool handler', async () => {
      const ctx = createContext()
      const handler = vi.fn(async (args: unknown) => ({ echoed: args }))
      ctx.agent.registerTool({
        id: 'echo',
        description: 'Echoes input.',
        handler,
      })

      const result = await ctx.agent.invoke('echo', { ping: true })
      expect(handler).toHaveBeenCalledWith({ ping: true })
      expect(result).toEqual({ echoed: { ping: true } })
    })

    it('dispatches to an RPC function via invokeLocal', async () => {
      const ctx = createContext()
      ctx.rpc.register(rpcDef({
        name: 'my-rpc',
        type: 'query',
        jsonSerializable: true,
        agent: { description: 'rpc' },
        setup: () => ({
          handler: async (a: number, b: number) => a + b,
        }),
      }))

      const result = await ctx.agent.invoke('my-rpc', { arg0: 2, arg1: 3 })
      expect(result).toBe(5)
    })

    it('throws for unknown tool id', async () => {
      const ctx = createContext()
      await expect(ctx.agent.invoke('missing', {})).rejects.toThrow(/missing/)
    })
  })

  describe('resources', () => {
    it('registerResource synthesizes URI and stores the read handler', async () => {
      const ctx = createContext()
      ctx.agent.registerResource({
        id: 'my-resource',
        name: 'My resource',
        read: () => ({ json: { hello: 'world' } }),
      })

      const resources = ctx.agent.list().resources
      expect(resources).toHaveLength(1)
      expect(resources[0]!.uri).toBe('devframe://resource/my-resource')

      const content = await ctx.agent.read('my-resource')
      expect(content).toEqual({ json: { hello: 'world' } })
    })

    it('keeps an explicit URI and passes the requested URI to the reader', async () => {
      const ctx = createContext()
      const read = vi.fn((uri: URL) => ({ text: uri.toString() }))
      ctx.agent.registerResource({
        id: 'custom-resource',
        uri: 'https://example.com/resources/current',
        name: 'Custom resource',
        read,
      })

      expect(ctx.agent.list().resources[0]!.uri).toBe('https://example.com/resources/current')
      expect(ctx.agent.getResource('https://example.com/resources/current')?.id).toBe('custom-resource')
      await expect(ctx.agent.read('custom-resource', 'https://example.com/resources/requested')).resolves.toEqual({
        text: 'https://example.com/resources/requested',
      })
      expect(read).toHaveBeenCalledWith(new URL('https://example.com/resources/requested'))
    })

    it('registers templates, enumerates instances, and forwards variables', async () => {
      const ctx = createContext()
      const read = vi.fn((uri: URL, variables: Readonly<Record<string, string | string[]>>) => ({
        json: { uri: uri.toString(), variables },
      }))
      ctx.agent.registerResource({
        id: 'logs',
        uriTemplate: 'devframe://logs/{name}',
        name: 'Logs',
        list: () => ({
          resources: [{ uri: 'devframe://logs/app', name: 'App logs', mimeType: 'text/plain' }],
        }),
        read,
      })

      expect(ctx.agent.list().resources).toEqual([])
      expect(ctx.agent.list().resourceTemplates).toEqual([{
        id: 'logs',
        uriTemplate: 'devframe://logs/{name}',
        name: 'Logs',
        description: undefined,
        mimeType: undefined,
      }])
      await expect(ctx.agent.listResourceInstances('logs')).resolves.toEqual({
        resources: [{ uri: 'devframe://logs/app', name: 'App logs', mimeType: 'text/plain' }],
      })
      await ctx.agent.read('logs', 'devframe://logs/app', { name: 'app' })
      expect(read).toHaveBeenCalledWith(new URL('devframe://logs/app'), { name: 'app' })
    })

    it('emits updates through resource and template handles', () => {
      const ctx = createContext()
      const updated = vi.fn()
      ctx.agent.events.on('agent:resource:updated', updated)
      const fixed = ctx.agent.registerResource({
        id: 'fixed',
        uri: 'https://example.com/fixed',
        name: 'Fixed',
        read: () => ({ text: 'fixed' }),
      })
      const template = ctx.agent.registerResource({
        id: 'template',
        uriTemplate: 'https://example.com/{name}',
        name: 'Template',
        read: () => ({ text: 'template' }),
      })

      fixed.notifyUpdated()
      template.notifyUpdated('https://example.com/one')
      expect(updated).toHaveBeenNthCalledWith(1, 'https://example.com/fixed')
      expect(updated).toHaveBeenNthCalledWith(2, 'https://example.com/one')

      fixed.unregister()
      template.unregister()
      expect(ctx.agent.list().resources).toEqual([])
      expect(ctx.agent.list().resourceTemplates).toEqual([])
      fixed.notifyUpdated()
      template.notifyUpdated('https://example.com/two')
      expect(updated).toHaveBeenCalledTimes(2)
    })

    it('throws DF0016 on duplicate id', () => {
      const ctx = createContext()
      ctx.agent.registerResource({
        id: 'dup',
        name: 'first',
        read: () => ({ text: 'a' }),
      })
      expect(() => ctx.agent.registerResource({
        id: 'dup',
        name: 'second',
        read: () => ({ text: 'b' }),
      })).toThrow(/already registered/)
    })

    it('throws when reading unknown resource', async () => {
      const ctx = createContext()
      await expect(ctx.agent.read('ghost')).rejects.toThrow(/ghost/)
    })
  })

  describe('registerResourceProvider()', () => {
    it('queries providers lazily for listing and reads', async () => {
      const ctx = createContext()
      let value: string | undefined
      const provider = vi.fn(() => value
        ? [{ id: 'provided', name: 'Provided', read: () => ({ text: value }) }]
        : [])
      ctx.agent.registerResourceProvider(provider)

      expect(ctx.agent.getResource('provided')).toBeUndefined()
      value = 'current'
      expect(ctx.agent.list().resources.map(resource => resource.id)).toEqual(['provided'])
      await expect(ctx.agent.read('provided')).resolves.toEqual({ text: 'current' })
      expect(provider).toHaveBeenCalledTimes(3)
    })

    it('keeps direct registrations and earlier providers on id collisions', async () => {
      const ctx = createContext()
      ctx.agent.registerResource({ id: 'direct', name: 'Direct', read: () => ({ text: 'direct' }) })
      ctx.agent.registerResourceProvider(() => [
        { id: 'direct', name: 'Hidden', read: () => ({ text: 'hidden' }) },
        { id: 'provided', name: 'First', read: () => ({ text: 'first' }) },
      ])
      ctx.agent.registerResourceProvider(() => [
        { id: 'provided', name: 'Second', read: () => ({ text: 'second' }) },
      ])

      expect(ctx.agent.list().resources.map(resource => resource.name)).toEqual(['Direct', 'First'])
      await expect(ctx.agent.read('direct')).resolves.toEqual({ text: 'direct' })
      await expect(ctx.agent.read('provided')).resolves.toEqual({ text: 'first' })
    })

    it('notifies membership and content changes only while registered', () => {
      const ctx = createContext()
      const manifestChanged = vi.fn()
      const resourceUpdated = vi.fn()
      const handle = ctx.agent.registerResourceProvider(() => [])
      ctx.agent.events.on('agent:manifest:changed', manifestChanged)
      ctx.agent.events.on('agent:resource:updated', resourceUpdated)

      handle.notifyChanged()
      handle.notifyUpdated('devframe://resource/provided')
      expect(manifestChanged).toHaveBeenCalledOnce()
      expect(resourceUpdated).toHaveBeenCalledWith('devframe://resource/provided')

      handle.unregister()
      handle.notifyChanged()
      handle.notifyUpdated('devframe://resource/provided')
      expect(manifestChanged).toHaveBeenCalledTimes(2)
      expect(resourceUpdated).toHaveBeenCalledOnce()
    })
  })

  describe('standard schema args on tool inputs', () => {
    it('carries args raw on the projected tool — conversion is deferred to protocol adapters', async () => {
      const v = await import('valibot')
      const ctx = createContext()
      const schema = v.object({ name: v.optional(v.string()) })
      ctx.agent.registerTool({
        id: 'schema:tool',
        description: 'Schema-typed.',
        args: [schema],
        handler: args => args,
      })

      const tool = ctx.agent.getTool('schema:tool')!
      // Mirrors how an RPC-backed tool defers to `ctx.rpc.definitions` — the
      // agent host itself never converts Standard Schema → JSON Schema (that
      // stays a protocol-adapter concern, e.g. the MCP adapter), so no
      // eager `inputSchema` is computed here.
      expect(tool.inputSchema).toBeUndefined()
      expect(tool.args).toEqual([schema])
    })

    it('an explicit inputSchema override wins over args', async () => {
      const v = await import('valibot')
      const ctx = createContext()
      ctx.agent.registerTool({
        id: 'override:tool',
        description: 'Override.',
        args: [v.object({ ignored: v.string() })],
        inputSchema: { type: 'object', properties: { custom: { type: 'string' } } },
        handler: () => {},
      })

      const schema = ctx.agent.getTool('override:tool')!.inputSchema as { properties: Record<string, unknown> }
      expect(Object.keys(schema.properties)).toEqual(['custom'])
    })
  })

  describe('registerToolProvider()', () => {
    it('queries the provider lazily on list/getTool/invoke', async () => {
      const ctx = createContext()
      const handler = vi.fn(async (args: unknown) => args)
      let exposed = false
      ctx.agent.registerToolProvider(() => exposed
        ? [{ id: 'derived:tool', description: 'Derived.', safety: 'read', handler }]
        : [])

      // The provider's source of truth changes; no re-registration needed.
      expect(ctx.agent.getTool('derived:tool')).toBeUndefined()
      exposed = true
      expect(ctx.agent.getTool('derived:tool')).toMatchObject({
        id: 'derived:tool',
        kind: 'tool',
        safety: 'read',
      })
      expect(ctx.agent.list().tools.map(t => t.id)).toEqual(['derived:tool'])

      await expect(ctx.agent.invoke('derived:tool', { a: 1 })).resolves.toEqual({ a: 1 })
      expect(handler).toHaveBeenCalledWith({ a: 1 })
    })

    it('earlier sources win on id collision', () => {
      const ctx = createContext()
      ctx.agent.registerTool({ id: 'shared:id', description: 'Registered.', handler: () => 'plain' })
      ctx.agent.registerToolProvider(() => [
        { id: 'shared:id', description: 'Provided.', handler: () => 'provided' },
      ])

      expect(ctx.agent.getTool('shared:id')!.description).toBe('Registered.')
      expect(ctx.agent.list().tools.filter(t => t.id === 'shared:id')).toHaveLength(1)
    })

    it('notifyChanged and unregister fire agent:manifest:changed', () => {
      const ctx = createContext()
      const manifestHandler = vi.fn()
      const handle = ctx.agent.registerToolProvider(() => [])
      ctx.agent.events.on('agent:manifest:changed', manifestHandler)

      handle.notifyChanged()
      expect(manifestHandler).toHaveBeenCalledTimes(1)

      handle.unregister()
      expect(manifestHandler).toHaveBeenCalledTimes(2)

      // After unregistration the handle goes quiet.
      handle.notifyChanged()
      handle.unregister()
      expect(manifestHandler).toHaveBeenCalledTimes(2)
    })
  })
})
