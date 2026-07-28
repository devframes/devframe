import type { AgentToolInput } from 'devframe/types'
import type { DevframeHubContext } from '../context'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { DevframeCommandsHost } from '../host-commands'

describe('devframeCommandsHost command id validation', () => {
  it('rejects duplicate ids inside one command tree', () => {
    const host = new DevframeCommandsHost({} as DevframeHubContext)

    expect(() => host.register({
      id: 'tool:parent',
      title: 'Parent',
      children: [
        { id: 'tool:child', title: 'Child' },
        { id: 'tool:child', title: 'Duplicate child' },
      ],
    })).toThrow('Command id "tool:child" is already used')
  })

  it('rejects child ids that collide with existing command trees', () => {
    const host = new DevframeCommandsHost({} as DevframeHubContext)
    host.register({
      id: 'tool:parent',
      title: 'Parent',
      children: [
        { id: 'tool:child', title: 'Child' },
      ],
    })

    expect(() => host.register({
      id: 'other:parent',
      title: 'Other parent',
      children: [
        { id: 'tool:child', title: 'Duplicate child' },
      ],
    })).toThrow('Command id "tool:child" is already used')

    expect(() => host.register({
      id: 'tool:child',
      title: 'Top-level collision',
    })).toThrow('Command id "tool:child" is already used')
  })

  it('validates updated children against other command trees', () => {
    const host = new DevframeCommandsHost({} as DevframeHubContext)
    host.register({
      id: 'other:parent',
      title: 'Other parent',
      children: [
        { id: 'other:child', title: 'Other child' },
      ],
    })
    const handle = host.register({
      id: 'tool:parent',
      title: 'Parent',
    })

    expect(() => handle.update({
      children: [
        { id: 'other:child', title: 'Duplicate child' },
      ],
    })).toThrow('Command id "other:child" is already used')
  })
})

function createAgentContext(): { context: DevframeHubContext, tools: Map<string, AgentToolInput> } {
  const tools = new Map<string, AgentToolInput>()
  const context = {
    agent: {
      registerTool: (input: AgentToolInput) => {
        tools.set(input.id, input)
        return { unregister: () => tools.delete(input.id) }
      },
    },
  } as unknown as DevframeHubContext
  return { context, tools }
}

describe('devframeCommandsHost agent bridge', () => {
  it('projects agent-flagged commands (incl. children) into ctx.agent', async () => {
    const { context, tools } = createAgentContext()
    const host = new DevframeCommandsHost(context)
    const calls: unknown[][] = []

    host.register({
      id: 'demo:parent',
      title: 'Parent group',
      children: [
        {
          id: 'demo:greet',
          title: 'Greet',
          agent: {
            description: 'Greet someone by name.',
            args: [v.object({ name: v.optional(v.string()) })],
          },
          handler: (...args: unknown[]) => {
            calls.push(args)
            return 'done'
          },
        },
      ],
    })

    // Group-only parent stays off the agent surface; the child projects.
    expect(tools.has('demo:parent')).toBe(false)
    const tool = tools.get('demo:greet')!
    expect(tool.description).toBe('Greet someone by name.')
    expect(tool.title).toBe('Greet')
    expect(tool.safety).toBe('action')
    expect((tool.inputSchema as { type: string }).type).toBe('object')

    // A single object args schema is unwrapped — the MCP args object lands
    // as the handler's first positional argument.
    await expect(tool.handler({ name: 'devframe' })).resolves.toBe('done')
    expect(calls).toEqual([[{ name: 'devframe' }]])
  })

  it('registers zero-arg tools for commands without an args schema', async () => {
    const { context, tools } = createAgentContext()
    const host = new DevframeCommandsHost(context)
    const calls: unknown[][] = []

    host.register({
      id: 'demo:ping',
      title: 'Ping',
      agent: { description: 'Ping the hub.', safety: 'read' },
      handler: (...args: unknown[]) => {
        calls.push(args)
      },
    })

    const tool = tools.get('demo:ping')!
    expect(tool.safety).toBe('read')
    await tool.handler({ stray: true })
    expect(calls).toEqual([[]])
  })

  it('re-syncs the projection on update and drops it on unregister', () => {
    const { context, tools } = createAgentContext()
    const host = new DevframeCommandsHost(context)

    const handle = host.register({
      id: 'demo:sync',
      title: 'Sync',
      agent: { description: 'Initial description.' },
      handler: () => {},
    })
    expect(tools.get('demo:sync')!.description).toBe('Initial description.')

    handle.update({ agent: { description: 'Patched description.' } })
    expect(tools.get('demo:sync')!.description).toBe('Patched description.')

    handle.unregister()
    expect(tools.has('demo:sync')).toBe(false)
  })

  it('rejects agent exposure on handler-less commands', () => {
    const { context } = createAgentContext()
    const host = new DevframeCommandsHost(context)

    expect(() => host.register({
      id: 'demo:group',
      title: 'Group',
      agent: { description: 'A group cannot be a tool.' },
    })).toThrow('declares agent exposure but has no handler')
  })

  it('keeps the agent field off the serializable entry', () => {
    const { context } = createAgentContext()
    const host = new DevframeCommandsHost(context)

    host.register({
      id: 'demo:wire',
      title: 'Wire',
      agent: { description: 'Not for the wire.' },
      handler: () => {},
    })

    const entry = host.list().find(cmd => cmd.id === 'demo:wire')!
    expect('agent' in entry).toBe(false)
    expect('handler' in entry).toBe(false)
  })
})
