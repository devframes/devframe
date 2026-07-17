import type { DevframeHubContext } from '../context'
import { describe, expect, it, vi } from 'vitest'
import { hubDocksActivate, hubTerminalsResize, hubTerminalsWrite } from '../rpc-builtins'

function contextWithSessions(sessions: Map<string, any>): DevframeHubContext {
  return { terminals: { sessions } } as unknown as DevframeHubContext
}

describe('hub terminal write/resize RPC', () => {
  it('forwards input to an interactive PTY session', async () => {
    const write = vi.fn()
    const resize = vi.fn()
    const ctx = contextWithSessions(new Map([
      ['pty', { id: 'pty', interactive: true, write, resize }],
    ]))

    const writeFn = await hubTerminalsWrite.setup!(ctx)
    await writeFn.handler!('pty', 'ls\n')
    expect(write).toHaveBeenCalledWith('ls\n')

    const resizeFn = await hubTerminalsResize.setup!(ctx)
    await resizeFn.handler!('pty', 120, 40)
    expect(resize).toHaveBeenCalledWith(120, 40)
  })

  it('rejects input to a read-only (child-process) session', async () => {
    const ctx = contextWithSessions(new Map([
      ['log', { id: 'log', type: 'child-process' }],
    ]))
    const writeFn = await hubTerminalsWrite.setup!(ctx)
    await expect(writeFn.handler!('log', 'x')).rejects.toThrow(/does not accept input/i)
  })

  it('rejects input to an unknown session', async () => {
    const ctx = contextWithSessions(new Map())
    const writeFn = await hubTerminalsWrite.setup!(ctx)
    await expect(writeFn.handler!('nope', 'x')).rejects.toThrow(/not registered/i)
  })
})

describe('hub docks activate RPC', () => {
  it('forwards dockId and params to docks.activate', async () => {
    const activate = vi.fn()
    const ctx = { docks: { activate } } as unknown as DevframeHubContext

    const fn = await hubDocksActivate.setup!(ctx)
    await fn.handler!({ dockId: 'devframes_plugin_terminals', params: { sessionId: 'sess-1' } })
    expect(activate).toHaveBeenCalledWith('devframes_plugin_terminals', { sessionId: 'sess-1' })
  })

  it('forwards a bare dockId without params', async () => {
    const activate = vi.fn()
    const ctx = { docks: { activate } } as unknown as DevframeHubContext

    const fn = await hubDocksActivate.setup!(ctx)
    await fn.handler!({ dockId: 'devframes_plugin_messages' })
    expect(activate).toHaveBeenCalledWith('devframes_plugin_messages', undefined)
  })
})
