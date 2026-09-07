import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { WebMcpModelContext, WebMcpToolDescriptor } from './webmcp'
import { RpcFunctionsCollectorBase } from 'devframe/rpc'
import { describe, expect, it, vi } from 'vitest'
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
