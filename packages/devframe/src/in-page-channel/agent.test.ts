import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { listBrowserAgentTools } from '../client/browser-agent'
import { createPageScriptChannel } from './page-script'

interface TestProtocol {
  pageScript: {
    add: (a: number, b: number) => { sum: number }
    hidden: () => string
  }
}

function schema<T>(json: Record<string, unknown>): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value: unknown) => ({ value: value as T }),
      jsonSchema: {
        input: () => json,
        output: () => json,
      },
    } as StandardSchemaV1<T>['~standard'],
  }
}

describe('in-page channel agent tools', () => {
  it('registers the original handler for browser-to-node agent transport', async () => {
    const channel = createPageScriptChannel<TestProtocol>({
      name: 'devframes:test',
      window: false,
      heartbeat: false,
      functions: {
        add: {
          jsonSerializable: true,
          agent: { description: 'Add two numbers.' },
          args: [schema<number>({ type: 'number' }), schema<number>({ type: 'number' })],
          returns: schema<{ sum: number }>({ type: 'object' }),
          handler: (a, b) => ({ sum: a + b }),
        },
        hidden: { handler: () => 'internal' },
      },
    })

    const tool = listBrowserAgentTools().find(tool => tool.id === 'devframes:test:add')!
    expect(tool).toMatchObject({
      description: 'Add two numbers.',
      safety: 'read',
      inputSchema: {
        type: 'object',
        properties: { arg0: { type: 'number' }, arg1: { type: 'number' } },
        required: ['arg0', 'arg1'],
        additionalProperties: false,
      },
    })
    await expect(tool.invoke({ arg0: 2, arg1: 3 })).resolves.toEqual({ sum: 5 })

    channel.close()
    expect(listBrowserAgentTools().some(tool => tool.id === 'devframes:test:add')).toBe(false)
  })

  it('rejects agent exposure without strict JSON serialization', () => {
    expect(() => createPageScriptChannel<TestProtocol>({
      name: 'devframes:invalid',
      window: false,
      functions: {
        add: {
          agent: { description: 'Add two numbers.' },
          handler: (a, b) => ({ sum: a + b }),
        },
        hidden: { handler: () => 'internal' },
      },
    })).toThrowError(/MCP requires JSON-serializable/)
  })
})
