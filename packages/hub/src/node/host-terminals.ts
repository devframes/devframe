import type { RpcStreamingChannel } from 'devframe/types'
import type { Result as TinyExecResult } from 'tinyexec'
import type {
  DevToolsChildProcessExecuteOptions,
  DevToolsChildProcessTerminalSession,
  DevToolsTerminalHost as DevToolsTerminalHostType,
  DevToolsTerminalSession,
  DevToolsTerminalSessionBase,
} from '../types/terminals'
import type { HubNodeContext } from './context'
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

export class DevToolsTerminalHost implements DevToolsTerminalHostType {
  public readonly sessions: DevToolsTerminalHostType['sessions'] = new Map()
  public readonly events: DevToolsTerminalHostType['events'] = createEventEmitter()

  private _boundStreams = new Map<string, {
    dispose: () => void
    stream: ReadableStream
  }>()

  private _channel?: RpcStreamingChannel<string>

  constructor(
    public readonly context: HubNodeContext,
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

  register(session: DevToolsTerminalSession): DevToolsTerminalSession {
    if (this.sessions.has(session.id)) {
      throw diagnostics.DF8200({ id: session.id })
    }
    this.sessions.set(session.id, session)
    this.bindStream(session)
    this.events.emit('terminal:session:updated', session)
    return session
  }

  update(patch: PartialWithoutId<DevToolsTerminalSession>): void {
    if (!this.sessions.has(patch.id)) {
      throw diagnostics.DF8201({ id: patch.id })
    }
    const session = this.sessions.get(patch.id)!
    Object.assign(session, patch)
    this.sessions.set(patch.id, session)
    this.bindStream(session)
    this.events.emit('terminal:session:updated', session)
  }

  remove(session: DevToolsTerminalSession): void {
    this._boundStreams.get(session.id)?.dispose()
    this.sessions.delete(session.id)
    this.events.emit('terminal:session:updated', session)
    this._boundStreams.delete(session.id)
  }

  private bindStream(session: DevToolsTerminalSession) {
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
          // unbounded history kept for the snapshot endpoint.
          sessionBuffer.push(result.value)
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
    executeOptions: DevToolsChildProcessExecuteOptions,
    terminal: Omit<DevToolsTerminalSessionBase, 'status'>,
  ): Promise<DevToolsChildProcessTerminalSession> {
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
      cp?.kill()
      cp = createChildProcess()
    }
    const terminate = async () => {
      cp?.kill()
      cp = undefined
      closeStream()
    }

    const session: DevToolsChildProcessTerminalSession = {
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
}
