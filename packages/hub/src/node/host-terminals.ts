import type { RpcStreamingChannel } from 'devframe/types'
import type { Result as TinyExecResult } from 'tinyexec'
import type { IPty } from 'zigpty'
import type {
  DevframeChildProcessExecuteOptions,
  DevframeChildProcessTerminalSession,
  DevframePtyExecuteOptions,
  DevframePtyTerminalSession,
  DevframeTerminalSession,
  DevframeTerminalSessionBase,
  DevframeTerminalsHost as DevframeTerminalsHostType,
} from '../types/terminals'
import type { DevframeHubContext } from './context'
import process from 'node:process'
import { createEventEmitter } from 'devframe/utils/events'
import { diagnostics } from './diagnostics'

type PartialWithoutId<T extends { id: string }> = Partial<T> & { id: string }

/**
 * Channel name used for terminal stream output. Stable, well-known so
 * hub-aware clients can subscribe by name.
 */
const TERMINAL_STREAM_CHANNEL = 'devframe:terminals' as const
const TERMINAL_REPLAY_WINDOW = 1000
/** Max chunks retained in the per-session scrollback buffer (bounded like the replay window). */
const TERMINAL_BUFFER_LIMIT = 1000

/** TERM handed to spawned PTYs; also used to reject fallback process labels. */
const PTY_TERM_NAME = 'xterm-256color'

export class DevframeTerminalsHost implements DevframeTerminalsHostType {
  public readonly sessions: DevframeTerminalsHostType['sessions'] = new Map()
  public readonly events: DevframeTerminalsHostType['events'] = createEventEmitter()

  private _boundStreams = new Map<string, {
    dispose: () => void
    stream: ReadableStream
  }>()

  private _channel?: RpcStreamingChannel<string>

  constructor(
    public readonly context: DevframeHubContext,
  ) {
  }

  /**
   * Lazily acquire the streaming channel — `context.rpc` isn't assigned
   * until after every host is constructed, so we can't grab it in the
   * constructor.
   */
  private getStreamingChannel(): RpcStreamingChannel<string> | undefined {
    if (this._channel)
      return this._channel
    if (!this.context.rpc?.streaming)
      return undefined
    this._channel = this.context.rpc.streaming.create<string>(
      TERMINAL_STREAM_CHANNEL,
      { replayWindow: TERMINAL_REPLAY_WINDOW },
    )
    return this._channel
  }

  register(session: DevframeTerminalSession): DevframeTerminalSession {
    if (this.sessions.has(session.id)) {
      throw diagnostics.DF8200({ id: session.id })
    }
    this.sessions.set(session.id, session)
    this.bindStream(session)
    this.events.emit('terminal:session:updated', session)
    return session
  }

  update(patch: PartialWithoutId<DevframeTerminalSession>): void {
    if (!this.sessions.has(patch.id)) {
      throw diagnostics.DF8201({ id: patch.id })
    }
    const session = this.sessions.get(patch.id)!
    Object.assign(session, patch)
    this.sessions.set(patch.id, session)
    this.bindStream(session)
    this.events.emit('terminal:session:updated', session)
  }

  remove(session: DevframeTerminalSession): void {
    this._boundStreams.get(session.id)?.dispose()
    this.sessions.delete(session.id)
    this.events.emit('terminal:session:updated', session)
    this._boundStreams.delete(session.id)
  }

  private bindStream(session: DevframeTerminalSession) {
    // Skip when the same stream is already bound
    if (this._boundStreams.has(session.id) && this._boundStreams.get(session.id)?.stream === session.stream)
      return

    // Dispose the previous stream
    this._boundStreams.get(session.id)?.dispose()
    this._boundStreams.delete(session.id)

    // If new stream is not available, skip
    if (!session.stream)
      return

    session.buffer ||= []
    const sessionBuffer = session.buffer

    const channel = this.getStreamingChannel()
    // The streaming channel reuses `session.id` as the stream id so clients
    // can subscribe immediately after seeing the session in
    // `devframe:terminals:list`.
    const sink = channel?.start({ id: session.id })

    const reader = session.stream.getReader()
    let disposed = false
    ;(async () => {
      try {
        while (true) {
          if (disposed)
            break
          const result = await reader.read()
          if (disposed)
            break
          if (result.done)
            break
          // Mirror to the legacy session.buffer used by `terminals:read` —
          // bounded tail kept for the snapshot endpoint.
          sessionBuffer.push(result.value)
          if (sessionBuffer.length > TERMINAL_BUFFER_LIMIT)
            sessionBuffer.splice(0, sessionBuffer.length - TERMINAL_BUFFER_LIMIT)
          sink?.write(result.value)
        }
        if (!disposed && sink && !sink.closed)
          sink.close()
      }
      catch (error) {
        if (!disposed && sink && !sink.closed)
          sink.error(error)
      }
      finally {
        try {
          reader.releaseLock()
        }
        catch {
          // Already released by the stream implementation.
        }
      }
    })()
    this._boundStreams.set(session.id, {
      dispose: () => {
        disposed = true
        reader.cancel('terminal stream disposed').catch(() => {})
        if (sink && !sink.closed)
          sink.close()
      },
      stream: session.stream,
    })
  }

  async startChildProcess(
    executeOptions: DevframeChildProcessExecuteOptions,
    terminal: Omit<DevframeTerminalSessionBase, 'status'>,
  ): Promise<DevframeChildProcessTerminalSession> {
    if (this.sessions.has(terminal.id)) {
      throw diagnostics.DF8200({ id: terminal.id })
    }
    const { exec } = await import('tinyexec')

    let controller: ReadableStreamDefaultController<string> | undefined
    let cp: TinyExecResult | undefined
    let runId = 0
    let streamClosed = false

    const closeStream = () => {
      if (streamClosed)
        return
      streamClosed = true
      try {
        controller?.close()
      }
      catch {
        // The stream may already be closed by cancellation.
      }
    }

    const errorStream = (error: unknown) => {
      if (streamClosed)
        return
      streamClosed = true
      try {
        controller?.error(error)
      }
      catch {
        // The stream may already be closed by cancellation.
      }
    }

    const stream = new ReadableStream<string>({
      start(_controller) {
        controller = _controller
      },
      cancel() {
        cp?.kill()
        cp = undefined
        closeStream()
      },
    })

    function createChildProcess() {
      const currentRun = ++runId
      const cp = exec(
        executeOptions.command,
        executeOptions.args || [],
        {
          nodeOptions: {
            env: {
              COLORS: 'true',
              FORCE_COLOR: 'true',
              ...(executeOptions.env || {}),
            },
            cwd: executeOptions.cwd ?? process.cwd(),
            stdio: 'pipe',
          },
        },
      )

      ;(async () => {
        try {
          for await (const chunk of cp) {
            if (streamClosed || currentRun !== runId)
              return
            controller?.enqueue(chunk)
          }
          if (currentRun === runId)
            closeStream()
        }
        catch (error) {
          if (currentRun === runId)
            errorStream(error)
        }
      })()

      return cp
    }

    cp = createChildProcess()

    const restart = async () => {
      if (streamClosed)
        return
      cp?.kill()
      cp = createChildProcess()
    }
    const terminate = async () => {
      cp?.kill()
      cp = undefined
      closeStream()
    }

    const session: DevframeChildProcessTerminalSession = {
      ...terminal,
      status: 'running',
      stream,
      type: 'child-process',
      executeOptions,
      getChildProcess: () => cp?.process,
      terminate,
      restart,
    }
    this.register(session)

    return Promise.resolve(session)
  }

  async startPtySession(
    executeOptions: DevframePtyExecuteOptions,
    terminal: Omit<DevframeTerminalSessionBase, 'status'>,
  ): Promise<DevframePtyTerminalSession> {
    if (this.sessions.has(terminal.id)) {
      throw diagnostics.DF8200({ id: terminal.id })
    }
    const { spawn } = await import('zigpty')

    const cols = executeOptions.cols ?? 80
    const rows = executeOptions.rows ?? 24

    let controller: ReadableStreamDefaultController<string> | undefined
    let pty: IPty | undefined
    let runId = 0
    let streamClosed = false

    const closeStream = () => {
      if (streamClosed)
        return
      streamClosed = true
      try {
        controller?.close()
      }
      catch {
        // The stream may already be closed by cancellation.
      }
    }

    const errorStream = (error: unknown) => {
      if (streamClosed)
        return
      streamClosed = true
      try {
        controller?.error(error)
      }
      catch {
        // The stream may already be closed by cancellation.
      }
    }

    const stream = new ReadableStream<string>({
      start(_controller) {
        controller = _controller
      },
      cancel() {
        pty?.kill()
        pty = undefined
        closeStream()
      },
    })

    const spawnPty = (): IPty => {
      const currentRun = ++runId
      const proc = spawn(executeOptions.command, executeOptions.args ?? [], {
        name: PTY_TERM_NAME,
        cols,
        rows,
        cwd: executeOptions.cwd ?? process.cwd(),
        env: {
          TERM: PTY_TERM_NAME,
          COLORTERM: 'truecolor',
          FORCE_COLOR: '1',
          ...(executeOptions.env ?? {}),
        },
      })
      proc.onData((data) => {
        if (streamClosed || currentRun !== runId)
          return
        controller?.enqueue(typeof data === 'string' ? data : data.toString('utf8'))
      })
      proc.onExit(() => {
        if (currentRun === runId)
          closeStream()
      })
      return proc
    }

    try {
      pty = spawnPty()
    }
    catch (error) {
      errorStream(error)
      throw diagnostics.DF8203({
        command: executeOptions.command,
        reason: error instanceof Error ? error.message : String(error),
      })
    }

    const session: DevframePtyTerminalSession = {
      ...terminal,
      status: 'running',
      interactive: true,
      stream,
      type: 'pty',
      executeOptions,
      write: (data) => {
        try {
          pty?.write(data)
        }
        catch {
          // Process already gone.
        }
      },
      resize: (nextCols, nextRows) => {
        try {
          pty?.resize(Math.max(1, nextCols), Math.max(1, nextRows))
        }
        catch {
          // Resize after exit is a no-op.
        }
      },
      getProcessName: () => {
        try {
          const name = pty?.process
          return name && name !== PTY_TERM_NAME ? name : undefined
        }
        catch {
          return undefined
        }
      },
      terminate: async () => {
        pty?.kill()
        pty = undefined
        closeStream()
      },
      restart: async () => {
        if (streamClosed)
          return
        pty?.kill()
        pty = spawnPty()
      },
    }
    this.register(session)

    return session
  }
}
