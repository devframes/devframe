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
 * `devframes:plugin:terminals:sessions` shared state and is returned by the
 * `list` RPC.
 */
export interface TerminalSessionInfo {
  id: string
  /** Base label derived from the spawn request (command / preset / "Shell"). */
  title: string
  /**
   * Live foreground process name of the controlling TTY (e.g. `vim`,
   * `node`), tracked for PTY-backed sessions. Undefined for piped sessions
   * and once the process has exited.
   */
  processName?: string
  /** User-assigned name; takes precedence over every derived title in the UI. */
  customTitle?: string
  /**
   * Window title the running program reported via OSC 0/2 escape sequences
   * (what a real terminal would show in its tab), e.g. `user@host: ~/dir`.
   */
  termTitle?: string
  /**
   * Working directory the running program reported via OSC 7 / OSC 9;9 /
   * OSC 1337 escape sequences (shell integration). Tracks `cd` live, unlike
   * the static spawn-time `cwd`.
   */
  termCwd?: string
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
  icon?: string
  channel?: string
  /**
   * Whether the session may be restarted in place. `false` hides the restart
   * control and makes the restart RPC reject it — used for sessions whose
   * lifecycle is owned elsewhere (surfaced from the hub's `restartable` flag).
   * Own sessions leave this unset (always restartable).
   */
  restartable?: boolean
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
  /**
   * Require the trust handshake on the standalone server. Enabled by
   * default — `--open` embeds the current OTP in the opened URL, so the
   * tab authenticates automatically without extra prompts. Hosted adapters
   * manage their own auth and ignore this.
   */
  auth?: boolean
}
