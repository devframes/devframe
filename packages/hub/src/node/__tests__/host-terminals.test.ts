import type { DevToolsTerminalSession } from '../../types/terminals'
import type { HubNodeContext } from '../context'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { DevToolsTerminalHost } from '../host-terminals'

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
  } as unknown as HubNodeContext

  return {
    host: new DevToolsTerminalHost(context),
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

describe('devToolsTerminalHost stream lifecycle', () => {
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
    const session: DevToolsTerminalSession = {
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
})
