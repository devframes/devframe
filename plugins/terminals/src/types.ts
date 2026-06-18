/**
 * How a session is driven.
 *
 * - `interactive` — a PTY-backed session that accepts keystrokes, resize,
 *   and renders full-screen TUIs (vim, htop, Claude Code, …). Falls back to
 *   a piped child process when no PTY backend is available.
 * - `readonly` — a piped child process whose combined output is streamed to
 *   viewers; stdin is rejected. Ideal for long-running logs / dev servers.
 */
export type TerminalMode = 'interactive' | 'readonly'

/** Lifecycle status of a session. */
export type TerminalStatus = 'running' | 'exited' | 'error'

/** Which OS-level mechanism backs a session. */
export type TerminalBackend = 'pty' | 'pipe'

/**
 * Serializable descriptor for a single terminal session. Lives in the
 * `devframes-plugin-terminals:sessions` shared state and is returned by the
 * `list` RPC.
 */
export interface TerminalSessionInfo {
  id: string
  title: string
  mode: TerminalMode
  status: TerminalStatus
  backend: TerminalBackend
  command: string
  args: string[]
  cwd: string
  cols: number
  rows: number
  pid?: number
  exitCode?: number
  /** Preset this session was spawned from, if any. */
  presetId?: string
  createdAt: number
}

export interface TerminalsSharedState {
  sessions: TerminalSessionInfo[]
}

/**
 * A pre-configured command the UI offers and that clients may spawn by id
 * without `allowArbitraryCommands`.
 */
export interface TerminalPreset {
  id: string
  title: string
  command: string
  args?: string[]
  cwd?: string
  /** @default 'readonly' for presets, 'interactive' for the shell */
  mode?: TerminalMode
  env?: Record<string, string>
  icon?: string
}

/** Wire payload for the `spawn` RPC. */
export interface SpawnRequest {
  /** Spawn a configured preset by id. */
  presetId?: string
  /**
   * Explicit command. Requires `allowArbitraryCommands` unless it resolves
   * to the configured shell. Omit to spawn the default shell.
   */
  command?: string
  args?: string[]
  cwd?: string
  mode?: TerminalMode
  title?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
}

/** Options accepted by {@link createTerminalsDevframe}. */
export interface TerminalsOptions {
  /** Shell used for interactive sessions. Defaults to `$SHELL` / platform default. */
  shell?: string
  /** Extra args passed to the shell. Defaults to an interactive-login flag set. */
  shellArgs?: string[]
  /** Default working directory for new sessions. Defaults to `ctx.cwd`. */
  cwd?: string
  /** Environment variables merged into every spawned session. */
  env?: Record<string, string>
  /** Spawnable command presets surfaced in the UI. */
  presets?: TerminalPreset[]
  /**
   * Allow clients to spawn arbitrary command strings beyond presets and the
   * configured shell. Default `false` (deny) for safety.
   */
  allowArbitraryCommands?: boolean
  /**
   * Default mode for the shell session created on demand.
   * @default 'interactive'
   */
  defaultMode?: TerminalMode
  /** Output chunks retained per session for replay on reconnect. */
  scrollback?: number
  /** Mount path override. */
  basePath?: string
  /** SPA dist dir override. Defaults to the bundled SPA. */
  distDir?: string
  /** CLI binary name. */
  command?: string
  /** Preferred dev-server port. */
  port?: number
}
