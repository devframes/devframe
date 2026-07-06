import type { EventEmitter } from 'devframe/types'
import type { ChildProcess } from 'node:child_process'
import type { DevframeDockEntryIcon } from './docks'

export interface DevframeTerminalsHost {
  readonly sessions: Map<string, DevframeTerminalSession>
  readonly events: EventEmitter<{
    'terminal:session:updated': (session: DevframeTerminalSession) => void
  }>

  register: (session: DevframeTerminalSession) => DevframeTerminalSession
  update: (session: DevframeTerminalSession) => void

  /**
   * Spawn a read-only child process (pipe-backed, output only). Use this for
   * long-running logs and dev servers that don't need input.
   */
  startChildProcess: (
    executeOptions: DevframeChildProcessExecuteOptions,
    terminal: Omit<DevframeTerminalSessionBase, 'status'>,
  ) => Promise<DevframeChildProcessTerminalSession>

  /**
   * Spawn a fully interactive pseudo-terminal (PTY) any plugin can drive:
   * keystrokes via {@link DevframePtyTerminalSession.write}, live layout via
   * {@link DevframePtyTerminalSession.resize}, TUI-capable. The session is
   * marked `interactive`, so a hub-aware terminal UI (e.g. the terminals
   * plugin) surfaces it as writable rather than read-only. Powered by
   * `zigpty` — where its native bindings can't load, it degrades to
   * pipe-based terminal emulation.
   */
  startPtySession: (
    executeOptions: DevframePtyExecuteOptions,
    terminal: Omit<DevframeTerminalSessionBase, 'status'>,
  ) => Promise<DevframePtyTerminalSession>
}

export type DevframeTerminalStatus = 'running' | 'stopped' | 'error'

export interface DevframeTerminalSessionBase {
  id: string
  title: string
  description?: string
  status: DevframeTerminalStatus
  icon?: DevframeDockEntryIcon
  /**
   * Whether the session accepts input (keystrokes + resize). `true` for
   * {@link DevframeTerminalsHost.startPtySession} sessions; absent/`false`
   * for pipe-backed, output-only ones. A hub-aware terminal UI reads this to
   * decide whether to enable stdin and wire resize.
   */
  interactive?: boolean
}

export interface DevframeTerminalSession extends DevframeTerminalSessionBase {
  buffer?: string[]
  stream?: ReadableStream<string>
}

export interface DevframeChildProcessExecuteOptions {
  command: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface DevframeChildProcessTerminalSession extends DevframeTerminalSession {
  type: 'child-process'
  executeOptions: DevframeChildProcessExecuteOptions
  getChildProcess: () => ChildProcess | undefined
  terminate: () => Promise<void>
  restart: () => Promise<void>
}

export interface DevframePtyExecuteOptions {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  /** Initial column count. Default: 80. */
  cols?: number
  /** Initial row count. Default: 24. */
  rows?: number
}

export interface DevframePtyTerminalSession extends DevframeTerminalSession {
  type: 'pty'
  interactive: true
  executeOptions: DevframePtyExecuteOptions
  /** Send keystrokes / raw input to the PTY. */
  write: (data: string) => void
  /** Resize the PTY (emits SIGWINCH so TUIs relayout). */
  resize: (cols: number, rows: number) => void
  /** Current foreground process name, when the backend can resolve it. */
  getProcessName: () => string | undefined
  terminate: () => Promise<void>
  restart: () => Promise<void>
}
