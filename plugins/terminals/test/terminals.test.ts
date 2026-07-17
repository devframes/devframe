import type { TerminalSessionInfo, TerminalsSharedState } from '../src/types'
import type { TerminalsServer, TestClient } from './_utils'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { SESSIONS_STATE_KEY, TERMINAL_STREAM_CHANNEL } from '../src/constants'
import { isPtyAvailable } from '../src/node/index'
import { bootClient, call, collectUntil, createFakeHubTerminals, startTerminalsServer } from './_utils'

vi.stubGlobal('WebSocket', WebSocket)

const NODE = process.execPath
const ptyAvailable = await isPtyAvailable()
const isWindows = process.platform === 'win32'

// A real pseudo-terminal works wherever zigpty's native bindings load
// (including Windows ConPTY); skip when they are unavailable.
const itPty = ptyAvailable ? it : it.skip

// These rely on POSIX PTY semantics that conpty doesn't provide: SIGWINCH,
// foreground-process-name resolution, and prompt stdin echo timing.
const itPosixPty = (!isWindows && ptyAvailable) ? it : it.skip

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

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
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

  it('normalizes bare LF from a piped readonly session to CRLF', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    // A piped child has no TTY to apply ONLCR, so it emits bare `\n`. Without
    // normalization xterm renders a staircase; the backend must translate lone
    // `\n` to `\r\n` while leaving an existing `\r\n` untouched.
    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("a\\nb\\r\\nc")'],
      mode: 'readonly',
    })

    const reader = subscribe(client, info.id)
    const output = await collectUntil(reader, acc => acc.includes('a') && acc.includes('b') && acc.includes('c'))
    expect(output).toContain('a\r\nb\r\nc')
    expect(output).not.toContain('a\nb')
    expect(output).not.toContain('\r\r\n')
  })

  it('rejects writes to a readonly session', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      mode: 'readonly',
    })

    await expect(
      call(client, 'devframes:plugin:terminals:write', { id: info.id, data: 'x' }),
    ).rejects.toThrow(/read-only/i)
  })

  itPosixPty('runs an interactive PTY session that accepts input', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdin.on("data", d => process.stdout.write("echo:" + d)); setTimeout(() => {}, 4000)'],
      mode: 'interactive',
    })
    expect(info.backend).toBe('pty')

    const reader = subscribe(client, info.id)
    await new Promise(r => setTimeout(r, 200))
    await call(client, 'devframes:plugin:terminals:write', { id: info.id, data: 'ping\n' })

    const output = await collectUntil(reader, acc => acc.includes('echo:ping'))
    expect(output).toContain('echo:ping')
  })

  itPty('gives interactive sessions a real TTY (TUI support)', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("isTTY=" + process.stdout.isTTY)'],
      mode: 'interactive',
    })

    const reader = subscribe(client, info.id)
    const output = await collectUntil(reader, acc => acc.includes('isTTY='))
    expect(output).toContain('isTTY=true')
  })

  itPosixPty('propagates resize to the PTY (SIGWINCH) for TUI layout', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("cols=" + process.stdout.columns); process.on("SIGWINCH", () => process.stdout.write(" winch=" + process.stdout.columns)); setInterval(() => {}, 4000)'],
      mode: 'interactive',
      cols: 80,
      rows: 24,
    })

    const reader = subscribe(client, info.id)
    await new Promise(r => setTimeout(r, 200))
    await call(client, 'devframes:plugin:terminals:resize', { id: info.id, cols: 120, rows: 40 })

    const output = await collectUntil(reader, acc => acc.includes('winch='))
    expect(output).toContain('winch=120')
  })

  it('restarts a session in place, reusing the same id', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("run")'],
      mode: 'readonly',
    })

    const restarted = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:restart', { id: info.id })
    expect(restarted.id).toBe(info.id)
    expect(restarted.status).toBe('running')
  })

  itPosixPty('tracks the foreground process name for PTY sessions', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 4000)'],
      mode: 'interactive',
    })

    await vi.waitFor(async () => {
      const list = await sessions(server)
      const s = list.find(x => x.id === info.id)
      expect(s?.processName?.toLowerCase()).toContain('node')
    }, { timeout: 4000 })

    await call(client, 'devframes:plugin:terminals:remove', { id: info.id })
  })

  it('tracks the title and cwd a program reports via OSC escapes', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    // OSC parsing rides the output stream, so it works for every backend —
    // a readonly piped session keeps this test deterministic cross-platform.
    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'process.stdout.write("\\x1B]2;osc-title\\x07\\x1B]7;file://localhost/tmp/osc-cwd\\x07"); setInterval(() => {}, 1000)'],
      mode: 'readonly',
    })

    await vi.waitFor(async () => {
      const list = await sessions(server)
      const s = list.find(x => x.id === info.id)
      expect(s?.termTitle).toBe('osc-title')
      expect(s?.termCwd).toBe('/tmp/osc-cwd')
    })

    await call(client, 'devframes:plugin:terminals:remove', { id: info.id })
  })

  it('supports custom renaming via the rename RPC', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 4000)'],
      mode: 'readonly',
    })

    await call(client, 'devframes:plugin:terminals:rename', { id: info.id, title: 'My Build' })
    let list = await call<TerminalSessionInfo[]>(client, 'devframes:plugin:terminals:list')
    expect(list.find(s => s.id === info.id)?.customTitle).toBe('My Build')

    // Empty string clears the custom name.
    await call(client, 'devframes:plugin:terminals:rename', { id: info.id, title: '   ' })
    list = await call<TerminalSessionInfo[]>(client, 'devframes:plugin:terminals:list')
    expect(list.find(s => s.id === info.id)?.customTitle).toBeUndefined()

    await call(client, 'devframes:plugin:terminals:remove', { id: info.id })
  })

  it('lists sessions and removes them', async () => {
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      mode: 'readonly',
    })

    let list = await call<TerminalSessionInfo[]>(client, 'devframes:plugin:terminals:list')
    expect(list.some(s => s.id === info.id)).toBe(true)

    await call(client, 'devframes:plugin:terminals:remove', { id: info.id })
    list = await call<TerminalSessionInfo[]>(client, 'devframes:plugin:terminals:list')
    expect(list.some(s => s.id === info.id)).toBe(false)
  })

  it('exposes presets and spawns from them', async () => {
    await server.close()
    server = await startTerminalsServer({
      presets: [{ id: 'greet', title: 'Greet', command: NODE, args: ['-e', 'process.stdout.write("from-preset")'], mode: 'readonly' }],
    })
    const client = bootClient(server.port)
    await new Promise(r => setTimeout(r, 50))

    const presets = await call<any[]>(client, 'devframes:plugin:terminals:presets')
    expect(presets.map(p => p.id)).toContain('greet')

    const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', { presetId: 'greet' })
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
      call(client, 'devframes:plugin:terminals:spawn', { command: 'definitely-not-allowed', mode: 'readonly' }),
    ).rejects.toThrow()
  })

  describe('hub aggregation', () => {
    it('surfaces sessions contributed by other devframes as read-only entries', async () => {
      await server.close()
      const hub = createFakeHubTerminals()
      server = await startTerminalsServer({}, { hub })
      const client = bootClient(server.port)
      await new Promise(r => setTimeout(r, 50))

      // Another devframe (e.g. code-server) registers into the hub.
      hub.register({
        id: 'devframes_plugin_code-server',
        title: 'Code Server',
        description: '/work',
        status: 'running',
        icon: 'ph:code-duotone',
      })

      const list = await call<TerminalSessionInfo[]>(client, 'devframes:plugin:terminals:list')
      const cs = list.find(s => s.id === 'devframes_plugin_code-server')
      expect(cs).toBeDefined()
      expect(cs?.title).toBe('Code Server')
      // Hub dock icon normalized to the client's UnoCSS icon class.
      expect(cs?.icon).toBe('i-ph-code-duotone')
      expect(cs?.mode).toBe('readonly')
      expect(cs?.status).toBe('running')
      // Its output is read from the hub's streaming channel, not the plugin's.
      expect(cs?.channel).toBe('devframe:terminals')

      // A stopped hub session maps onto the plugin's 'exited' status.
      hub.update({ id: 'devframes_plugin_code-server', status: 'stopped' })
      const afterStop = await call<TerminalSessionInfo[]>(client, 'devframes:plugin:terminals:list')
      expect(afterStop.find(s => s.id === 'devframes_plugin_code-server')?.status).toBe('exited')

      // Removing it from the hub drops it from the plugin's list.
      hub.remove({ id: 'devframes_plugin_code-server' })
      const afterRemove = await call<TerminalSessionInfo[]>(client, 'devframes:plugin:terminals:list')
      expect(afterRemove.some(s => s.id === 'devframes_plugin_code-server')).toBe(false)
    })

    it('mirrors its own sessions into the hub without looping', async () => {
      await server.close()
      const hub = createFakeHubTerminals()
      server = await startTerminalsServer({}, { hub })
      const client = bootClient(server.port)
      await new Promise(r => setTimeout(r, 50))

      const info = await call<TerminalSessionInfo>(client, 'devframes:plugin:terminals:spawn', {
        command: NODE,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        mode: 'readonly',
      })

      // The plugin's own session is mirrored into the hub (syncHub), and the
      // resulting hub event must not re-enter and duplicate it in the list.
      await vi.waitFor(() => {
        expect(hub.sessions.has(info.id)).toBe(true)
      })
      const list = await call<TerminalSessionInfo[]>(client, 'devframes:plugin:terminals:list')
      expect(list.filter(s => s.id === info.id)).toHaveLength(1)
      // Own sessions carry no aggregation channel (owned + controllable).
      expect(list.find(s => s.id === info.id)?.channel).toBeUndefined()

      await call(client, 'devframes:plugin:terminals:remove', { id: info.id })
    })
  })
})
