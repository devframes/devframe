import type { TerminalSessionInfo, TerminalsSharedState } from '../src/types'
import type { TerminalsServer, TestClient } from './_utils'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { SESSIONS_STATE_KEY, TERMINAL_STREAM_CHANNEL } from '../src/constants'
import { bootClient, call, collectUntil, startTerminalsServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

const NODE = process.execPath
// PTY semantics differ on Windows (conpty): no SIGWINCH, the foreground
// process name resolves to the TERM name, and stdin round-trips are slow to
// render. These behaviours are exercised on POSIX; Windows keeps the
// `isTTY` interactive coverage below.
const itPosix = process.platform === 'win32' ? it.skip : it

function subscribe(client: TestClient, id: string) {
  return client.streaming.subscribe<string>(TERMINAL_STREAM_CHANNEL, id)
}

async function sessions(server: TerminalsServer): Promise<TerminalSessionInfo[]> {
  const state = await server.ctx.rpc.sharedState.get(SESSIONS_STATE_KEY)
  return (state.value() as TerminalsSharedState).sessions
}

describe('@devframes/plugin-terminals', () => {
  let server: TerminalsServer

  beforeEach(async () => {
    server = await startTerminalsServer()
  })

  afterEach(async () => {
    await server?.close()
  })

  it('streams output from a readonly session and marks it exited', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("hello-readonly")'],
      mode: 'readonly',
    })
    expect(info.mode).toBe('readonly')

    const reader = subscribe(client, info.id)
    const output = await collectUntil(reader, acc => acc.includes('hello-readonly'))
    expect(output).toContain('hello-readonly')

    await vi.waitFor(async () => {
      const list = await sessions(server)
      expect(list.find(s => s.id === info.id)?.status).toBe('exited')
    })
  })

  it('rejects writes to a readonly session', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      mode: 'readonly',
    })

    await expect(
      call(client, 'devframes-plugin-terminals:write', { id: info.id, data: 'x' }),
    ).rejects.toThrow(/read-only/i)
  })

  itPosix('runs an interactive PTY session that accepts input', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdin.on("data", d => process.stdout.write("echo:" + d)); setTimeout(() => {}, 4000)'],
      mode: 'interactive',
    })
    expect(info.backend).toBe('pty')

    const reader = subscribe(client, info.id)
    await new Promise(r => setTimeout(r, 200))
    await call(client, 'devframes-plugin-terminals:write', { id: info.id, data: 'ping\n' })

    const output = await collectUntil(reader, acc => acc.includes('echo:ping'))
    expect(output).toContain('echo:ping')
  })

  it('gives interactive sessions a real TTY (TUI support)', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("isTTY=" + process.stdout.isTTY)'],
      mode: 'interactive',
    })

    const reader = subscribe(client, info.id)
    const output = await collectUntil(reader, acc => acc.includes('isTTY='))
    expect(output).toContain('isTTY=true')
  })

  itPosix('propagates resize to the PTY (SIGWINCH) for TUI layout', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("cols=" + process.stdout.columns); process.on("SIGWINCH", () => process.stdout.write(" winch=" + process.stdout.columns)); setInterval(() => {}, 4000)'],
      mode: 'interactive',
      cols: 80,
      rows: 24,
    })

    const reader = subscribe(client, info.id)
    await new Promise(r => setTimeout(r, 200))
    await call(client, 'devframes-plugin-terminals:resize', { id: info.id, cols: 120, rows: 40 })

    const output = await collectUntil(reader, acc => acc.includes('winch='))
    expect(output).toContain('winch=120')
  })

  it('restarts a session in place, reusing the same id', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("run")'],
      mode: 'readonly',
    })

    const restarted = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:restart', { id: info.id })
    expect(restarted.id).toBe(info.id)
    expect(restarted.status).toBe('running')
  })

  itPosix('tracks the foreground process name for PTY sessions', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 4000)'],
      mode: 'interactive',
    })

    await vi.waitFor(async () => {
      const list = await sessions(server)
      const s = list.find(x => x.id === info.id)
      expect(s?.processName?.toLowerCase()).toContain('node')
    }, { timeout: 4000 })

    await call(client, 'devframes-plugin-terminals:remove', { id: info.id })
  })

  it('supports custom renaming via the rename RPC', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 4000)'],
      mode: 'readonly',
    })

    await call(client, 'devframes-plugin-terminals:rename', { id: info.id, title: 'My Build' })
    let list = await call<TerminalSessionInfo[]>(client, 'devframes-plugin-terminals:list')
    expect(list.find(s => s.id === info.id)?.customTitle).toBe('My Build')

    // Empty string clears the custom name.
    await call(client, 'devframes-plugin-terminals:rename', { id: info.id, title: '   ' })
    list = await call<TerminalSessionInfo[]>(client, 'devframes-plugin-terminals:list')
    expect(list.find(s => s.id === info.id)?.customTitle).toBeUndefined()

    await call(client, 'devframes-plugin-terminals:remove', { id: info.id })
  })

  it('lists sessions and removes them', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', {
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      mode: 'readonly',
    })

    let list = await call<TerminalSessionInfo[]>(client, 'devframes-plugin-terminals:list')
    expect(list.some(s => s.id === info.id)).toBe(true)

    await call(client, 'devframes-plugin-terminals:remove', { id: info.id })
    list = await call<TerminalSessionInfo[]>(client, 'devframes-plugin-terminals:list')
    expect(list.some(s => s.id === info.id)).toBe(false)
  })

  it('exposes presets and spawns from them', async () => {
    await server.close()
    server = await startTerminalsServer({
      presets: [{ id: 'greet', title: 'Greet', command: NODE, args: ['-e', 'process.stdout.write("from-preset")'], mode: 'readonly' }],
    })
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const presets = await call<any[]>(client, 'devframes-plugin-terminals:presets')
    expect(presets.map(p => p.id)).toContain('greet')

    const info = await call<TerminalSessionInfo>(client, 'devframes-plugin-terminals:spawn', { presetId: 'greet' })
    expect(info.presetId).toBe('greet')

    const reader = subscribe(client, info.id)
    const output = await collectUntil(reader, acc => acc.includes('from-preset'))
    expect(output).toContain('from-preset')
  })

  it('rejects arbitrary commands unless explicitly allowed', async () => {
    await server.close()
    server = await startTerminalsServer({ allowArbitraryCommands: false })
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    await expect(
      call(client, 'devframes-plugin-terminals:spawn', { command: 'definitely-not-allowed', mode: 'readonly' }),
    ).rejects.toThrow()
  })
})
