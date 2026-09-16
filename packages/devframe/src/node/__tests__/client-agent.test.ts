import type { AgentToolInput } from 'devframe/types'
import { describe, expect, it, vi } from 'vitest'
import { removeClientAgentSession, syncClientAgentTools } from '../client-agent'

describe('client agent tools', () => {
  it('projects a browser manifest and invokes its originating RPC session', async () => {
    let provider: (() => readonly AgentToolInput[]) | undefined
    const notifyChanged = vi.fn()
    const context = {
      agent: {
        registerToolProvider(next: () => readonly AgentToolInput[]) {
          provider = next
          return { notifyChanged, unregister() {} }
        },
      },
    }
    const callRaw = vi.fn().mockResolvedValue(['refetched'])
    const session = {
      meta: { id: 1, subscribedStates: new Set<string>() },
      rpc: { $callRaw: callRaw },
    }

    syncClientAgentTools(context, session, [{
      id: 'pinia-colada:refetch',
      description: 'Refetch matching queries.',
      safety: 'action',
      inputSchema: { type: 'object' },
    }])
    const [tool] = provider!()
    expect(tool).toMatchObject({
      id: 'pinia-colada:refetch',
      description: 'Refetch matching queries.',
      inputSchema: { type: 'object' },
    })
    await expect(tool!.handler!({ arg0: {} })).resolves.toEqual(['refetched'])
    expect(callRaw).toHaveBeenCalledWith({
      method: 'devframe:agent:invoke-client-tool',
      args: ['pinia-colada:refetch', { arg0: {} }],
    })

    removeClientAgentSession(context, session.meta)
    expect(provider!()).toEqual([])
    expect(notifyChanged).toHaveBeenCalledTimes(2)
  })
})
