import type { WebMcpModelContext } from 'devframe/client'
import { RpcFunctionsCollectorBase } from 'devframe/rpc'
import { describe, expect, it } from 'vitest'
import { executeWebMcpTool, invokeClientFunction, listClientFunctions, loadWebMcpState } from '../app/composables/client'

function createCollector() {
  const collector = new RpcFunctionsCollectorBase<Record<string, any>, undefined>(undefined)
  collector.register({
    name: 'my-plugin:get-selection',
    jsonSerializable: true,
    agent: { description: 'Return the selected node.' },
    handler: () => ({ id: 'node-1' }),
  })
  collector.register({
    name: 'my-plugin:highlight',
    type: 'action',
    handler: () => {},
  })
  return collector
}

describe('listClientFunctions', () => {
  it('projects client definitions into the shared RpcFunctionInfo shape, sorted', () => {
    const infos = listClientFunctions(createCollector())
    expect(infos.map(fn => fn.name)).toEqual(['my-plugin:get-selection', 'my-plugin:highlight'])
    expect(infos[0]).toMatchObject({
      type: 'query',
      jsonSerializable: true,
      invokable: true,
      agent: { description: 'Return the selected node.' },
    })
    expect(infos[1]).toMatchObject({ type: 'action', invokable: false })
  })
})

describe('invokeClientFunction', () => {
  it('invokes a read-only function locally and returns the result envelope', async () => {
    const result = await invokeClientFunction(createCollector(), 'my-plugin:get-selection', [])
    expect(result.ok).toBe(true)
    expect(result.result).toEqual({ id: 'node-1' })
  })

  it('refuses side-effecting function types', async () => {
    const result = await invokeClientFunction(createCollector(), 'my-plugin:highlight', [])
    expect(result.ok).toBe(false)
    expect(result.error?.message).toContain('action')
  })

  it('normalizes a thrown error', async () => {
    const collector = createCollector()
    collector.register({
      name: 'boom',
      handler: () => {
        throw new Error('nope')
      },
    })
    const result = await invokeClientFunction(collector, 'boom', [])
    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({ name: 'Error', message: 'nope' })
  })
})

describe('loadWebMcpState', () => {
  it('reads tools live from a model context with getTools()', async () => {
    const modelContext: WebMcpModelContext = {
      registerTool: () => {},
      getTools: async () => [{ name: 'add-todo', description: 'Add a todo.', origin: 'http://localhost' }],
      executeTool: async () => 'ok',
    }
    const state = await loadWebMcpState(createCollector(), modelContext)
    expect(state).toMatchObject({ available: true, live: true, executable: true })
    expect(state.tools.map(tool => tool.name)).toEqual(['add-todo'])
  })

  it('decodes a JSON-string inputSchema (Chromium wire shape)', async () => {
    const modelContext: WebMcpModelContext = {
      registerTool: () => {},
      getTools: async () => [{ name: 'add-todo', inputSchema: '{"type":"object"}' }],
    }
    const state = await loadWebMcpState(createCollector(), modelContext)
    expect(state.tools[0]!.inputSchema).toEqual({ type: 'object' })
  })

  it('projects agent-flagged client functions when there is no model context', async () => {
    const state = await loadWebMcpState(createCollector(), undefined)
    expect(state).toMatchObject({ available: false, live: false, executable: false })
    expect(state.tools).toEqual([
      {
        name: 'my-plugin_get-selection',
        description: 'Return the selected node.',
        source: 'my-plugin:get-selection',
      },
    ])
  })

  it('projects when the model context provides registration only', async () => {
    const state = await loadWebMcpState(createCollector(), { registerTool: () => {} })
    expect(state).toMatchObject({ available: true, live: false })
    expect(state.tools.map(tool => tool.name)).toEqual(['my-plugin_get-selection'])
  })
})

describe('executeWebMcpTool', () => {
  it('executes through a string-based model context (Chromium wire shape)', async () => {
    const modelContext: WebMcpModelContext = {
      registerTool: () => {},
      /** Mirrors Chromium's current build: JSON string in, JSON string out. */
      executeTool: async (tool, args) => JSON.stringify({ tool: tool.name, args: typeof args === 'string' ? JSON.parse(args) : args }),
    }
    const result = await executeWebMcpTool(modelContext, { name: 'add-todo' }, { text: 'milk' })
    expect(result.ok).toBe(true)
    expect(result.result).toEqual({ tool: 'add-todo', args: { text: 'milk' } })
  })

  it('falls back to dictionary args for a spec-shaped model context', async () => {
    const modelContext: WebMcpModelContext = {
      registerTool: () => {},
      executeTool: async (tool, args) => {
        // Mirrors WebIDL dictionary conversion refusing a string argument.
        if (typeof args === 'string')
          throw new TypeError('The provided value is not of type dictionary.')
        return { tool: tool.name, args }
      },
    }
    const result = await executeWebMcpTool(modelContext, { name: 'add-todo' }, { text: 'milk' })
    expect(result.ok).toBe(true)
    expect(result.result).toEqual({ tool: 'add-todo', args: { text: 'milk' } })
  })

  it('normalizes an execution error', async () => {
    const modelContext: WebMcpModelContext = {
      registerTool: () => {},
      executeTool: async () => {
        throw new Error('denied')
      },
    }
    const result = await executeWebMcpTool(modelContext, { name: 'add-todo' }, {})
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('denied')
  })
})
