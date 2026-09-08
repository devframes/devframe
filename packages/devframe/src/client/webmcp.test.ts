import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ConnectionMeta } from 'devframe/types'
import type { WebMcpModelContext, WebMcpToolDescriptor } from './webmcp'
import { RpcFunctionsCollectorBase } from 'devframe/rpc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDevframeRpcClient } from './rpc'
import { registerWebMcpTools } from './webmcp'

/** A Standard Schema that also implements the Standard JSON Schema converter (like zod 4). */
function withJsonSchema(json: Record<string, unknown>): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value }),
      jsonSchema: {
        input: () => json,
        output: () => json,
      },
    } as StandardSchemaV1['~standard'],
  }
}

/** Spec-shaped model context: unregisters by aborting the passed signal. */
function createFakeModelContext() {
  const tools = new Map<string, WebMcpToolDescriptor>()
  const modelContext: WebMcpModelContext = {
    registerTool(tool, options) {
      tools.set(tool.name, tool)
      options?.signal?.addEventListener('abort', () => tools.delete(tool.name))
      return Promise.resolve()
    },
  }
  return { modelContext, tools }
}

function createCollector() {
  return new RpcFunctionsCollectorBase<Record<string, any>, undefined>(undefined)
}

describe('registerWebMcpTools', () => {
  it('registers only agent-flagged functions, under their wire names', () => {
    const collector = createCollector()
    collector.register({
      name: 'my-plugin:greet',
      jsonSerializable: true,
      agent: { description: 'Greet someone by name.' },
      args: [withJsonSchema({ type: 'string' })],
      returns: withJsonSchema({ type: 'string' }),
      handler: (name: string) => `Hello ${name}`,
    })
    collector.register({
      name: 'my-plugin:internal',
      handler: () => 'hidden',
    })

    const { modelContext, tools } = createFakeModelContext()
    const dispose = registerWebMcpTools(collector, { modelContext })

    expect([...tools.keys()]).toEqual(['my-plugin_greet'])
    const tool = tools.get('my-plugin_greet')!
    expect(tool.description).toBe('Greet someone by name.')
    expect(tool.inputSchema).toEqual({
      type: 'object',
      properties: { arg0: { type: 'string' } },
      required: ['arg0'],
      additionalProperties: false,
    })
    // `query` (default type) infers read-only.
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })

    dispose()
    expect(tools.size).toBe(0)
  })

  it('executes with arg0/argN coercion and returns a text result', async () => {
    const collector = createCollector()
    collector.register({
      name: 'add',
      jsonSerializable: true,
      agent: { description: 'Add two numbers.' },
      args: [withJsonSchema({ type: 'number' }), withJsonSchema({ type: 'number' })],
      returns: withJsonSchema({ type: 'object' }),
      handler: (a: number, b: number) => ({ sum: a + b }),
    })

    const { modelContext, tools } = createFakeModelContext()
    registerWebMcpTools(collector, { modelContext })

    const result = await tools.get('add')!.execute({ arg0: 2, arg1: 3 })
    expect(result.isError).toBeUndefined()
    expect(JSON.parse(result.content[0]!.text)).toEqual({ sum: 5 })
  })

  it('surfaces a thrown error as an isError text result', async () => {
    const collector = createCollector()
    collector.register({
      name: 'boom',
      type: 'action',
      jsonSerializable: true,
      agent: { description: 'Always fails.' },
      handler: () => {
        throw new Error('nope')
      },
    })

    const { modelContext, tools } = createFakeModelContext()
    registerWebMcpTools(collector, { modelContext })

    const result = await tools.get('boom')!.execute({})
    expect(result.isError).toBe(true)
    expect(result.content[0]!.text).toBe('Error: nope')
  })

  it('follows later register/update calls until disposed', async () => {
    const collector = createCollector()
    const { modelContext, tools } = createFakeModelContext()
    const dispose = registerWebMcpTools(collector, { modelContext })
    expect(tools.size).toBe(0)

    collector.register({
      name: 'greet',
      jsonSerializable: true,
      agent: { description: 'Greet.' },
      handler: () => 'hi',
    })
    expect(tools.has('greet')).toBe(true)

    collector.update({
      name: 'greet',
      jsonSerializable: true,
      agent: { description: 'Greet politely.' },
      handler: () => 'good day',
    })
    expect(tools.get('greet')!.description).toBe('Greet politely.')
    const updated = await tools.get('greet')!.execute({})
    expect(updated.content[0]!.text).toBe('good day')

    dispose()
    expect(tools.size).toBe(0)

    // Post-dispose registrations no longer reach the model context.
    collector.register({
      name: 'late',
      jsonSerializable: true,
      agent: { description: 'Too late.' },
      handler: () => 'late',
    })
    expect(tools.size).toBe(0)
  })

  it('keeps the first registration when two ids sanitize to the same wire name', () => {
    // Chromium rejects a duplicate tool name with an InvalidStateError; the
    // guard must skip the collision before it reaches the model context.
    const { modelContext, tools } = createFakeModelContext()
    const strict: WebMcpModelContext = {
      registerTool: (tool, options) => {
        if (tools.has(tool.name))
          throw new Error('Duplicate tool name')
        return modelContext.registerTool(tool, options)
      },
    }
    const collector = createCollector()
    collector.register({
      name: 'my-plugin:greet',
      jsonSerializable: true,
      agent: { description: 'First.' },
      handler: () => 'first',
    })
    collector.register({
      name: 'my-plugin_greet',
      jsonSerializable: true,
      agent: { description: 'Second, same wire name.' },
      handler: () => 'second',
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      registerWebMcpTools(collector, { modelContext: strict })
      expect(tools.size).toBe(1)
      expect(tools.get('my-plugin_greet')!.description).toBe('First.')
      expect(warn).toHaveBeenCalledOnce()
    }
    finally {
      warn.mockRestore()
    }
  })

  it('tolerates a model context that rejects registration (permissions policy)', async () => {
    // A rejected registration must not surface as an unhandled rejection.
    const collector = createCollector()
    collector.register({
      name: 'denied',
      jsonSerializable: true,
      agent: { description: 'Denied by the frame policy.' },
      handler: () => 'never',
    })
    const dispose = registerWebMcpTools(collector, {
      modelContext: { registerTool: () => Promise.reject(new Error('NotAllowedError')) },
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    dispose()
  })

  it('unregisters through a legacy handle when registerTool returns one', () => {
    const unregister = vi.fn()
    const modelContext: WebMcpModelContext = {
      registerTool: () => ({ unregister }),
    }
    const collector = createCollector()
    collector.register({
      name: 'legacy',
      jsonSerializable: true,
      agent: { description: 'Legacy handle.' },
      handler: () => 'ok',
    })

    const dispose = registerWebMcpTools(collector, { modelContext })
    dispose()
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('is a no-op without a model context', () => {
    const collector = createCollector()
    collector.register({
      name: 'greet',
      jsonSerializable: true,
      agent: { description: 'Greet.' },
      handler: () => 'hi',
    })
    expect(() => registerWebMcpTools(collector)()).not.toThrow()
  })
})

describe('getDevframeRpcClient: WebMCP wiring', () => {
  // Minimal fake WebSocket: never opens, so the trust handshake stays
  // pending; this suite only exercises the client-collector side.
  class FakeWebSocket {
    addEventListener(): void {}
    removeEventListener(): void {}
    send(): void {}
    close(): void {}
  }

  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('location', {
      protocol: 'http:',
      host: 'localhost:5173',
      hostname: 'localhost',
      href: 'http://localhost:5173/__foo/index.html',
      origin: 'http://localhost:5173',
    })
    const served: ConnectionMeta = { backend: 'websocket', websocket: { path: '__ws' } }
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => served,
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubModelContext() {
    const { modelContext, tools } = createFakeModelContext()
    vi.stubGlobal('navigator', { userAgent: 'test', modelContext })
    return tools
  }

  it('mirrors agent-flagged client registrations onto the page model context; close() unregisters', async () => {
    const tools = stubModelContext()
    const rpc = await getDevframeRpcClient({ baseURL: '/__foo/', otpParam: false })
    rpc.client.register({
      name: 'my-plugin:get-selection',
      jsonSerializable: true,
      agent: { description: 'Return the selected node.' },
      handler: () => 'node-1',
    })
    expect([...tools.keys()]).toEqual(['my-plugin_get-selection'])

    rpc.close?.()
    expect(tools.size).toBe(0)
  })

  it('webmcp: false keeps the browser side off the WebMCP surface', async () => {
    const tools = stubModelContext()
    const rpc = await getDevframeRpcClient({ baseURL: '/__foo/', otpParam: false, webmcp: false })
    rpc.client.register({
      name: 'my-plugin:get-selection',
      jsonSerializable: true,
      agent: { description: 'Return the selected node.' },
      handler: () => 'node-1',
    })
    expect(tools.size).toBe(0)
  })
})
