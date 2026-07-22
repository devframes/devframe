import type { DevframeHubContext } from '../context'
import { describe, expect, it, vi } from 'vitest'
import {
  hubDocksActivate,
  hubTerminalsRemove,
  hubTerminalsResize,
  hubTerminalsRestart,
  hubTerminalsTerminate,
  hubTerminalsWrite,
} from '../rpc-builtins'

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

describe('hub terminal terminate/restart/remove RPC', () => {
  it('terminates a controllable (child-process or pty) session', async () => {
    const terminate = vi.fn()
    const ctx = contextWithSessions(new Map([
      ['log', { id: 'log', type: 'child-process', terminate }],
    ]))
    const fn = await hubTerminalsTerminate.setup!(ctx)
    await fn.handler!('log')
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('restarts a restartable session', async () => {
    const restart = vi.fn()
    const ctx = contextWithSessions(new Map([
      ['log', { id: 'log', type: 'child-process', terminate: vi.fn(), restart }],
    ]))
    const fn = await hubTerminalsRestart.setup!(ctx)
    await fn.handler!('log')
    expect(restart).toHaveBeenCalledOnce()
  })

  it('rejects restarting a session marked restartable: false', async () => {
    const restart = vi.fn()
    const ctx = contextWithSessions(new Map([
      ['svc', { id: 'svc', type: 'child-process', terminate: vi.fn(), restart, restartable: false }],
    ]))
    const fn = await hubTerminalsRestart.setup!(ctx)
    await expect(fn.handler!('svc')).rejects.toThrow(/not restartable/i)
    expect(restart).not.toHaveBeenCalled()
  })

  it('rejects controlling a session with no lifecycle handle', async () => {
    const ctx = contextWithSessions(new Map([
      ['bare', { id: 'bare' }],
    ]))
    const fn = await hubTerminalsTerminate.setup!(ctx)
    await expect(fn.handler!('bare')).rejects.toThrow(/cannot be controlled/i)
  })

  it('kills then drops a session on remove', async () => {
    const terminate = vi.fn()
    const remove = vi.fn()
    const session = { id: 'log', type: 'child-process', terminate }
    const ctx = {
      terminals: { sessions: new Map([['log', session]]), remove },
    } as unknown as DevframeHubContext
    const fn = await hubTerminalsRemove.setup!(ctx)
    await fn.handler!('log')
    expect(terminate).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith(session)
  })

  it('removes a bare registered session without a terminate handle', async () => {
    const remove = vi.fn()
    const session = { id: 'mirror' }
    const ctx = {
      terminals: { sessions: new Map([['mirror', session]]), remove },
    } as unknown as DevframeHubContext
    const fn = await hubTerminalsRemove.setup!(ctx)
    await fn.handler!('mirror')
    expect(remove).toHaveBeenCalledWith(session)
  })

  it('rejects removing an unknown session', async () => {
    const remove = vi.fn()
    const ctx = {
      terminals: { sessions: new Map(), remove },
    } as unknown as DevframeHubContext
    const fn = await hubTerminalsRemove.setup!(ctx)
    await expect(fn.handler!('nope')).rejects.toThrow(/not registered/i)
    expect(remove).not.toHaveBeenCalled()
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
