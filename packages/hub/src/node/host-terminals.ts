import type { RpcStreamingChannel } from 'devframe/types'
import type { Buffer } from 'node:buffer'
import type { Result as TinyExecResult } from 'tinyexec'
import type { IPty } from 'zigpty'
import type {
  DevframeChildProcessExecuteOptions,
  DevframeChildProcessOutput,
  DevframeChildProcessResult,
  DevframeChildProcessTerminalSession,
  DevframePtyExecuteOptions,
  DevframePtyOutput,
  DevframePtyResult,
  DevframePtyTerminalSession,
  DevframeTerminalSession,
  DevframeTerminalSessionBase,
  DevframeTerminalsHost as DevframeTerminalsHostType,
} from '../types/terminals'
import type { DevframeHubContext } from './context'
import process from 'node:process'
import { createEventEmitter } from 'devframe/utils/events'
import { HUB_EVENTS } from '../events'
import { diagnostics } from './diagnostics'

type PartialWithoutId<T extends { id: string }> = Partial<T> & { id: string }

/**
 * Channel name used for terminal stream output. Stable, well-known so
 * hub-aware clients can subscribe by name.
 */
const TERMINAL_STREAM_CHANNEL = HUB_EVENTS.stream.terminals
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
    this.events.emit(HUB_EVENTS.bus.terminalsSessionUpdated, session)
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
    this.events.emit(HUB_EVENTS.bus.terminalsSessionUpdated, session)
  }

  remove(session: DevframeTerminalSession): void {
    this._boundStreams.get(session.id)?.dispose()
    this.sessions.delete(session.id)
    this.events.emit(HUB_EVENTS.bus.terminalsSessionUpdated, session)
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
    let currentResult: DevframeChildProcessResult | undefined
    let runId = 0
    let streamClosed = false
    let session: DevframeChildProcessTerminalSession

    // Keep the registered session's `status` in step with the process
    // lifecycle so a hub-aware client (and any launcher tracking this session)
    // sees `running` → `stopped`/`error` transitions instead of a value frozen
    // at spawn time.
    const markStatus = (next: DevframeTerminalSession['status']): void => {
      if (session.status === next)
        return
      session.status = next
      this.events.emit(HUB_EVENTS.bus.terminalsSessionUpdated, session)
    }

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
      let runErrored = false
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

      // Capture stdout/stderr separately (for `getResult()`) by listening on
      // the raw child process directly, rather than consuming `cp`'s own
      // async iterator/promise — those merge stdout+stderr line-by-line and
      // would starve one another if both were read from.
      const stdoutChunks: string[] = []
      const stderrChunks: string[] = []
      let settled = false
      let resolveOutput!: (output: DevframeChildProcessOutput) => void
      const outputPromise = new Promise<DevframeChildProcessOutput>((resolve) => {
        resolveOutput = resolve
      })

      const settle = (exitCode: number | undefined) => {
        if (settled || currentRun !== runId)
          return
        settled = true
        resolveOutput({
          stdout: stdoutChunks.join(''),
          stderr: stderrChunks.join(''),
          exitCode,
        })
      }

      cp.process?.stdout?.on('data', (chunk: Buffer | string) => {
        if (currentRun !== runId)
          return
        const text = chunk.toString()
        stdoutChunks.push(text)
        if (!streamClosed)
          controller?.enqueue(text)
      })
      cp.process?.stderr?.on('data', (chunk: Buffer | string) => {
        if (currentRun !== runId)
          return
        const text = chunk.toString()
        stderrChunks.push(text)
        if (!streamClosed)
          controller?.enqueue(text)
      })
      cp.process?.once('error', (error) => {
        if (currentRun !== runId)
          return
        runErrored = true
        settle(cp.process?.exitCode ?? undefined)
        errorStream(error)
        markStatus('error')
      })
      cp.process?.once('close', (code) => {
        settle(code ?? undefined)
        if (currentRun !== runId)
          return
        closeStream()
        // A spawn/runtime error already settled the status; a non-zero exit
        // code is a crash. A clean exit, or a signal kill (no numeric code —
        // e.g. terminate()/restart()), is a deliberate/normal stop.
        if (!runErrored)
          markStatus(typeof code === 'number' && code !== 0 ? 'error' : 'stopped')
      })

      currentResult = {
        get pid() {
          return cp.process?.pid
        },
        get exitCode() {
          return cp.process?.exitCode ?? undefined
        },
        get killed() {
          return cp.process?.killed === true
        },
        kill: signal => cp.kill(signal),
        then: (onfulfilled, onrejected) => outputPromise.then(onfulfilled, onrejected),
      }

      return cp
    }

    cp = createChildProcess()

    const restart = async () => {
      if (streamClosed)
        throw diagnostics.DF8206({ id: terminal.id })
      cp?.kill()
      cp = createChildProcess()
      markStatus('running')
    }
    const terminate = async () => {
      cp?.kill()
      cp = undefined
      closeStream()
      markStatus('stopped')
    }

    session = {
      ...terminal,
      status: 'running',
      stream,
      type: 'child-process',
      executeOptions,
      getChildProcess: () => cp?.process,
      getResult: () => currentResult!,
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
    let currentResult: DevframePtyResult | undefined
    let killCurrentRun: (() => void) | undefined
    let runId = 0
    let streamClosed = false
    let session: DevframePtyTerminalSession

    // Keep the registered session's `status` in step with the process
    // lifecycle so a hub-aware client (and any launcher tracking this session)
    // sees `running` → `stopped`/`error` transitions instead of a value frozen
    // at spawn time.
    const markStatus = (next: DevframeTerminalSession['status']): void => {
      if (session.status === next)
        return
      session.status = next
      this.events.emit(HUB_EVENTS.bus.terminalsSessionUpdated, session)
    }

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
        killCurrentRun?.()
        pty = undefined
        closeStream()
      },
    })

    const spawnPty = (): IPty => {
      const currentRun = ++runId
      const ptyProcess = spawn(executeOptions.command, executeOptions.args ?? [], {
        name: PTY_TERM_NAME,
        cols,
        rows,
        cwd: executeOptions.cwd ?? process.cwd(),
        env: {
          ...process.env,
          TERM: PTY_TERM_NAME,
          COLORTERM: 'truecolor',
          FORCE_COLOR: '1',
          ...(executeOptions.env ?? {}),
        },
      })
      const outputChunks: string[] = []
      let killed = false
      let settled = false
      let settledExitCode: number | undefined
      let resolveOutput!: (output: DevframePtyOutput) => void
      const outputPromise = new Promise<DevframePtyOutput>((resolve) => {
        resolveOutput = resolve
      })

      const settle = (exitCode: number, signal: number): void => {
        if (settled)
          return
        settled = true
        killed ||= signal !== 0
        settledExitCode = killed ? undefined : exitCode
        resolveOutput({
          output: outputChunks.join(''),
          exitCode: settledExitCode,
          signal: signal === 0 ? undefined : signal,
        })
      }

      ptyProcess.onData((data) => {
        const text = typeof data === 'string' ? data : data.toString('utf8')
        outputChunks.push(text)
        if (!streamClosed && currentRun === runId)
          controller?.enqueue(text)
      })
      ptyProcess.onExit(({ exitCode, signal }) => {
        settle(exitCode, signal)
        if (currentRun !== runId)
          return
        closeStream()
        /**
         * A signal kill (terminate()/restart()) and a clean exit are deliberate stops.
         * Only an unsignalled non-zero exit code is a crash, matching the child-process path.
         */
        markStatus(signal === 0 && exitCode !== 0 ? 'error' : 'stopped')
      })
      currentResult = {
        get pid() {
          return ptyProcess.pid
        },
        get exitCode() {
          return killed ? undefined : (ptyProcess.exitCode ?? settledExitCode)
        },
        get killed() {
          return killed
        },
        then: (onfulfilled, onrejected) => outputPromise.then(onfulfilled, onrejected),
      }
      killCurrentRun = () => {
        if (ptyProcess.exitCode !== null)
          return
        killed = true
        ptyProcess.kill()
      }
      return ptyProcess
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

    session = {
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
      getResult: () => currentResult!,
      terminate: async () => {
        killCurrentRun?.()
        pty = undefined
        closeStream()
        markStatus('stopped')
      },
      restart: async () => {
        if (streamClosed)
          throw diagnostics.DF8206({ id: terminal.id })
        killCurrentRun?.()
        killCurrentRun = undefined
        pty = undefined
        try {
          pty = spawnPty()
        }
        catch (error) {
          markStatus('error')
          throw diagnostics.DF8203({
            command: executeOptions.command,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
        markStatus('running')
      },
    }
    this.register(session)

    return session
  }
}
