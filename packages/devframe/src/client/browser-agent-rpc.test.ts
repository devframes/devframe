import type { BrowserAgentToolManifest } from './browser-agent'
import type { BrowserAgentInvocationDefinition } from './browser-agent-rpc'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerBrowserAgentTool } from './browser-agent'
import { setupBrowserAgentRpcBridge } from './browser-agent-rpc'

describe('browser agent RPC bridge', () => {
  const disposals: (() => void)[] = []
  afterEach(() => disposals.splice(0).forEach(dispose => dispose()))

  it('synchronizes manifests and invokes the original browser tool', async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>()
    const callOptional = vi.fn().mockResolvedValue(undefined)
    const rpc = {
      client: {
        register(definition: BrowserAgentInvocationDefinition) {
          handlers.set(definition.name, definition.handler)
        },
      },
      callOptional(
        method: 'devframe:agent:sync-client-tools',
        tools: BrowserAgentToolManifest[],
      ) {
        return callOptional(method, tools)
      },
      events: { on: () => () => {} },
    }

    disposals.push(registerBrowserAgentTool({
      id: 'todos:add',
      description: 'Add a todo.',
      safety: 'action',
      inputSchema: { type: 'object' },
      invoke: args => ({ added: args.text }),
    }))
    disposals.push(setupBrowserAgentRpcBridge(rpc))
    await vi.waitFor(() => expect(callOptional).toHaveBeenCalledWith(
      'devframe:agent:sync-client-tools',
      [{
        id: 'todos:add',
        description: 'Add a todo.',
        safety: 'action',
        inputSchema: { type: 'object' },
      }],
    ))

    await expect(handlers.get('devframe:agent:invoke-client-tool')!(
      'todos:add',
      { text: 'milk' },
    )).resolves.toEqual({ added: 'milk' })
  })
})
