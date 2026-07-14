import type { DevframeTerminalSession } from '../../types/terminals'
import type { DevframeHubContext } from '../context'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { hasNative } from 'zigpty'
import { DevframeTerminalsHost } from '../host-terminals'

const NODE = process.execPath
// A real PTY works wherever zigpty's native bindings load (incl. Windows
// ConPTY); skip when they're unavailable.
const itPty = hasNative ? it : it.skip
// Interactive stdin echo relies on POSIX PTY semantics that Windows ConPTY
// doesn't reliably provide (echo timing); skip there, mirroring the terminals
// plugin's own `itPosixPty` gate.
const itPosixPty = (hasNative && process.platform !== 'win32') ? it : it.skip

interface FakeSink {
  write: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  readonly closed: boolean
}

function createTerminalHost() {
  const sinks = new Map<string, FakeSink>()
  const context = {
    rpc: {
      streaming: {
        create: () => ({
          start: ({ id }: { id: string }) => {
            let closed = false
            const sink: FakeSink = {
              write: vi.fn(),
              close: vi.fn(() => {
                closed = true
              }),
              error: vi.fn(() => {
                closed = true
              }),
              get closed() {
                return closed
              },
            }
            sinks.set(id, sink)
            return sink
          },
        }),
      },
    },
  } as unknown as DevframeHubContext

  return {
    host: new DevframeTerminalsHost(context),
    sinks,
  }
}

async function waitUntil(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 1000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      assertion()
      return
    }
    catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  throw lastError
}

describe('devframeTerminalHost stream lifecycle', () => {
  it('cancels a bound stream when a session is removed', async () => {
    const { host, sinks } = createTerminalHost()
    let controller: ReadableStreamDefaultController<string>
    let cancelled = false
    const stream = new ReadableStream<string>({
      start(_controller) {
        controller = _controller
      },
      cancel() {
        cancelled = true
      },
    })
    const session: DevframeTerminalSession = {
      id: 'terminal',
      title: 'Terminal',
      status: 'running',
      stream,
    }

    host.register(session)
    controller!.enqueue('hello')

    await waitUntil(() => {
      expect(session.buffer).toEqual(['hello'])
    })

    host.remove(session)

    await waitUntil(() => {
      expect(cancelled).toBe(true)
    })
    expect(sinks.get('terminal')?.closed).toBe(true)
  })

  it('closes child-process streams after natural process exit', async () => {
    const { host, sinks } = createTerminalHost()

    const session = await host.startChildProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("done")'],
    }, {
      id: 'child',
      title: 'Child',
    })

    await waitUntil(() => {
      expect(sinks.get('child')?.closed).toBe(true)
    })
    expect(session.buffer?.join('')).toContain('done')
  })

  it('closes child-process streams on terminate', async () => {
    const { host, sinks } = createTerminalHost()

    const session = await host.startChildProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
    }, {
      id: 'child',
      title: 'Child',
    })

    await session.terminate()

    await waitUntil(() => {
      expect(sinks.get('child')?.closed).toBe(true)
    })
    expect(session.getChildProcess()).toBeUndefined()
  })

  it('bounds the session scrollback buffer', async () => {
    const { host } = createTerminalHost()
    let controller: ReadableStreamDefaultController<string>
    const stream = new ReadableStream<string>({
      start(_controller) {
        controller = _controller
      },
    })
    const session: DevframeTerminalSession = { id: 't', title: 'T', status: 'running', stream }
    host.register(session)
    for (let i = 0; i < 1200; i++) controller!.enqueue(`line-${i}`)
    // Wait for the read loop to drain every enqueued chunk (each read is its
    // own microtask tick) before asserting the trimmed shape.
    await waitUntil(() => {
      expect(session.buffer!.at(-1)).toBe('line-1199')
    })
    // Keeps the newest, drops the oldest.
    expect(session.buffer!.length).toBeLessThanOrEqual(1000)
    expect(session.buffer!.includes('line-0')).toBe(false)
  })

  it('does not restart a terminated child-process session', async () => {
    const { host, sinks } = createTerminalHost()
    const session = await host.startChildProcess(
      { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] },
      { id: 'child', title: 'Child' },
    )
    await session.terminate()
    await waitUntil(() => {
      expect(sinks.get('child')?.closed).toBe(true)
    })
    await session.restart()
    // Stream stays closed; no orphan output stream.
    expect(sinks.get('child')?.closed).toBe(true)
  })

  it('getResult() resolves with separately captured stdout/stderr and the exit code', async () => {
    const { host } = createTerminalHost()

    const session = await host.startChildProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)'],
    }, {
      id: 'child',
      title: 'Child',
    })

    const output = await session.getResult()
    expect(output).toEqual({ stdout: 'out', stderr: 'err', exitCode: 3 })
    // The merged display stream still carries both, for terminal rendering.
    expect(session.buffer?.join('')).toContain('out')
    expect(session.buffer?.join('')).toContain('err')
  })

  it('getResult() exposes live pid/exitCode/killed before and after exit', async () => {
    const { host } = createTerminalHost()

    const session = await host.startChildProcess({
      command: process.execPath,
      args: ['-e', 'setTimeout(() => process.exit(0), 50)'],
    }, {
      id: 'child',
      title: 'Child',
    })

    const result = session.getResult()
    expect(result.pid).toBeTypeOf('number')
    expect(result.exitCode).toBeUndefined()
    expect(result.killed).toBe(false)

    await result
    expect(result.exitCode).toBe(0)
  })

  it('getResult() tracks the new run after restart()', async () => {
    const { host } = createTerminalHost()

    // Long-running, so the stream is still open (and `restart()` allowed)
    // by the time we restart it.
    const session = await host.startChildProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
    }, {
      id: 'child',
      title: 'Child',
    })

    const firstHandle = session.getResult()
    expect(firstHandle.exitCode).toBeUndefined()

    await session.restart()
    const secondHandle = session.getResult()
    // A fresh result handle for the fresh run, not the stale first one.
    expect(secondHandle).not.toBe(firstHandle)

    await session.terminate()
  })

  it('getResult() still settles with the real exit code after terminate()', async () => {
    const { host, sinks } = createTerminalHost()
    const session = await host.startChildProcess(
      { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] },
      { id: 'child', title: 'Child' },
    )
    const result = session.getResult()
    await session.terminate()
    await waitUntil(() => {
      expect(sinks.get('child')?.closed).toBe(true)
    })

    const output = await result
    expect(output.exitCode).toBeUndefined()
  })
})

describe('devframeTerminalHost interactive PTY sessions', () => {
  itPosixPty('spawns an interactive PTY that accepts input and is marked interactive', async () => {
    const { host, sinks } = createTerminalHost()

    const session = await host.startPtySession({
      command: NODE,
      args: ['-e', 'process.stdin.on("data", d => process.stdout.write("echo:" + d)); setTimeout(() => {}, 4000)'],
    }, {
      id: 'pty',
      title: 'PTY',
    })

    expect(session.type).toBe('pty')
    expect(session.interactive).toBe(true)
    expect(host.sessions.get('pty')?.interactive).toBe(true)

    session.write('ping\n')

    await waitUntil(() => {
      expect(sinks.get('pty')?.write).toHaveBeenCalled()
      const written = sinks.get('pty')!.write.mock.calls.map(c => c[0]).join('')
      expect(written).toContain('echo:ping')
    })

    await session.terminate()
    await waitUntil(() => {
      expect(sinks.get('pty')?.closed).toBe(true)
    })
  })

  itPty('closes the PTY stream after natural process exit', async () => {
    const { host, sinks } = createTerminalHost()

    const session = await host.startPtySession({
      command: NODE,
      args: ['-e', 'process.stdout.write("done")'],
    }, {
      id: 'pty-exit',
      title: 'PTY exit',
    })

    // Session shape (cross-platform): a PTY session is flagged interactive so
    // hub-aware UIs enable stdin.
    expect(session.type).toBe('pty')
    expect(session.interactive).toBe(true)
    expect(host.sessions.get('pty-exit')?.interactive).toBe(true)

    await waitUntil(() => {
      expect(sinks.get('pty-exit')?.closed).toBe(true)
    })
  })

  itPty('does not accept resize after termination without throwing', async () => {
    const { host } = createTerminalHost()

    const session = await host.startPtySession({
      command: NODE,
      args: ['-e', 'setInterval(() => {}, 4000)'],
      cols: 80,
      rows: 24,
    }, {
      id: 'pty-resize',
      title: 'PTY resize',
    })

    expect(() => session.resize(120, 40)).not.toThrow()
    await session.terminate()
    expect(() => session.resize(100, 30)).not.toThrow()
  })
})
