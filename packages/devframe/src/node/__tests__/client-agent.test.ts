import type { AgentToolInput } from 'devframe/types'
import type { BrowserAgentClientInfo } from '../../client/browser-agent'
import { describe, expect, it, vi } from 'vitest'
import { LIST_CLIENTS_TOOL, removeClientAgentSession, syncClientAgentTools } from '../client-agent'

function harness() {
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
  const refetch = { id: 'pinia-colada:refetch', description: 'Refetch matching queries.', safety: 'action' as const, inputSchema: { type: 'object', properties: { arg0: { type: 'string' } } } }
  let nextId = 1
  function session(id: string, info: Partial<BrowserAgentClientInfo> = {}) {
    const callRaw = vi.fn().mockResolvedValue(`from ${id}`)
    return {
      session: { meta: { id: nextId++, subscribedStates: new Set<string>() }, rpc: { $callRaw: callRaw } },
      callRaw,
      id,
      info: { url: `http://localhost/${id}`, title: id, visible: true, focused: false, ...info },
    }
  }
  /** Sync `tab` with `refetch`, optionally overriding its reported focus. */
  function sync(tab: ReturnType<typeof session>, focused?: boolean) {
    syncClientAgentTools(context, tab.session, tab.id, [refetch], focused === undefined ? tab.info : { ...tab.info, focused })
  }
  const tool = (id: string) => provider!().find(t => t.id === id)!
  return { context, notifyChanged, session, sync, refetch, tool, tools: () => provider!() }
}

describe('client agent tools', () => {
  it('projects a browser manifest and invokes its originating RPC session', async () => {
    const h = harness()
    const a = h.session('tab-a')

    h.sync(a)
    const tool = h.tool('pinia-colada:refetch')
    expect(tool).toMatchObject({ id: 'pinia-colada:refetch', description: 'Refetch matching queries.' })
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: { arg0: { type: 'string' }, client_id: { type: 'string' } },
    })
    await expect(tool.handler({ arg0: 'x' })).resolves.toBe('from tab-a')
    expect(a.callRaw).toHaveBeenCalledWith({
      method: 'devframe:agent:invoke-client-tool',
      args: ['pinia-colada:refetch', { arg0: 'x' }],
    })

    removeClientAgentSession(h.context, a.session.meta)
    expect(h.tools()).toEqual([])
    expect(h.notifyChanged).toHaveBeenCalledTimes(2)
  })

  it('lists every connected tab once and dedupes their shared tools', () => {
    const h = harness()
    const a = h.session('tab-a')
    const b = h.session('tab-b', { focused: true })
    h.sync(a)
    h.sync(b)

    expect(h.tools().map(t => t.id)).toEqual(['pinia-colada:refetch', LIST_CLIENTS_TOOL])
    expect(h.tool(LIST_CLIENTS_TOOL).handler({})).toEqual({
      clients: [
        expect.objectContaining({ id: 'tab-a', url: 'http://localhost/tab-a', focused: false, tools: ['pinia-colada:refetch'] }),
        expect.objectContaining({ id: 'tab-b', focused: true, tools: ['pinia-colada:refetch'] }),
      ],
    })
  })

  it('routes an addressed call to that tab and strips client_id', async () => {
    const h = harness()
    const a = h.session('tab-a')
    const b = h.session('tab-b', { focused: true })
    h.sync(a)
    h.sync(b)

    await expect(h.tool('pinia-colada:refetch').handler({ client_id: 'tab-a', arg0: 'x' })).resolves.toBe('from tab-a')
    expect(a.callRaw).toHaveBeenCalledWith({
      method: 'devframe:agent:invoke-client-tool',
      args: ['pinia-colada:refetch', { arg0: 'x' }],
    })
    expect(b.callRaw).not.toHaveBeenCalled()
  })

  it('fails an unknown client_id with the live ids', async () => {
    const h = harness()
    const a = h.session('tab-a')
    h.sync(a)

    await expect(async () => h.tool('pinia-colada:refetch').handler({ client_id: 'gone' }))
      .rejects
      .toThrow(/client "gone".*Connected clients: tab-a/)
  })

  it('defaults to the most recently focused visible tab, then the last synced', async () => {
    vi.useFakeTimers()
    try {
      const h = harness()
      const a = h.session('tab-a')
      const b = h.session('tab-b')
      const c = h.session('tab-c', { visible: false })

      vi.setSystemTime(1000)
      h.sync(a, true)
      vi.setSystemTime(2000)
      h.sync(b, true)
      vi.setSystemTime(3000)
      h.sync(c, true)
      // b focused last among visible tabs; c is hidden despite the latest sync.
      await expect(h.tool('pinia-colada:refetch').handler({})).resolves.toBe('from tab-b')

      // b blurs, a regains focus later: a wins.
      vi.setSystemTime(4000)
      h.sync(b, false)
      vi.setSystemTime(5000)
      h.sync(a, true)
      await expect(h.tool('pinia-colada:refetch').handler({})).resolves.toBe('from tab-a')

      // Nothing visible: the last synced tab takes it.
      const d = h.session('tab-d', { visible: false })
      removeClientAgentSession(h.context, a.session.meta)
      removeClientAgentSession(h.context, b.session.meta)
      vi.setSystemTime(6000)
      h.sync(d)
      await expect(h.tool('pinia-colada:refetch').handler({})).resolves.toBe('from tab-d')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('does not republish the tool list on a focus-only re-sync', () => {
    const h = harness()
    const a = h.session('tab-a')
    h.sync(a)
    h.sync(a, true)
    expect(h.notifyChanged).toHaveBeenCalledTimes(1)
  })
})
