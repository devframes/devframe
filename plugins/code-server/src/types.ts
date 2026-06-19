/** Lifecycle state of the managed code-server process. */
export type CodeServerStatus = 'stopped' | 'starting' | 'running' | 'error'

/**
 * Result of probing the host for a usable `code-server` binary. Drives the
 * launcher UI: when `installed` is false the SPA renders install instructions
 * instead of a launch button.
 */
export interface CodeServerDetection {
  /** Whether detection has run at least once on this context. */
  checked: boolean
  /** Whether the `code-server` binary resolved and reported a version. */
  installed: boolean
  /** Version string reported by `code-server --version`, when installed. */
  version?: string
  /** The binary name / path probed (configurable via options). */
  bin: string
}

/** Serializable, secret-free description of the code-server process. */
export interface CodeServerServerInfo {
  status: CodeServerStatus
  /** Port code-server is bound to, when starting/running. */
  port?: number
  /** Epoch ms the current process was started. */
  startedAt?: number
  /** OS process id, when running. */
  pid?: number
  /** Last error message, when `status === 'error'`. */
  error?: string
}

/**
 * The full shared-state payload broadcast to subscribed clients. Deliberately
 * carries no authentication material — see {@link CodeServerAuth}.
 */
export interface CodeServerSharedState {
  detection: CodeServerDetection
  server: CodeServerServerInfo
}

/**
 * Auto-authentication handoff for the iframe. code-server runs with password
 * auth (`HASHED_PASSWORD`); the valid session is the SHA-256 of a server-side
 * token. The client sets `cookieName=cookieValue` for the current host before
 * loading the iframe, so the editor loads already signed in — no login page.
 *
 * Returned only from the `start` / `status` RPCs (the connection is already
 * authorized with devframe's auth), never published to shared state.
 */
export interface CodeServerAuth {
  cookieName: string
  cookieValue: string
}

/** Result of the `status` query — shared state plus auth when running. */
export interface CodeServerStatusResult extends CodeServerSharedState {
  auth?: CodeServerAuth
}

/** Result of the `start` action — identical shape to {@link CodeServerStatusResult}. */
export type CodeServerStartResult = CodeServerStatusResult

/** Wire payload for the `start` RPC. */
export interface CodeServerStartRequest {
  /** Workspace folder to open. Defaults to the configured / context cwd. */
  folder?: string
}

/** Options accepted by {@link createCodeServerDevframe}. */
export interface CodeServerOptions {
  /** code-server binary to detect and launch. Defaults to `code-server` (PATH). */
  bin?: string
  /** Workspace folder code-server opens. Defaults to `ctx.cwd`. */
  cwd?: string
  /** Force a specific code-server port. Defaults to a free port near 8080. */
  serverPort?: number
  /** Host code-server binds to. Defaults to `0.0.0.0` so the preview is reachable. */
  host?: string
  /** Extra CLI arguments forwarded verbatim to code-server. */
  args?: string[]
  /** Environment variables merged into the code-server process. */
  env?: Record<string, string>
  /**
   * `--cookie-suffix` passed to code-server, isolating its session cookie from
   * other local code-server instances. Supported on recent code-server only;
   * left unset by default for compatibility.
   */
  cookieSuffix?: string
  /** Milliseconds to wait for code-server readiness before failing. */
  startTimeout?: number
  /** Mount path override for the launcher SPA. */
  basePath?: string
  /** Launcher SPA dist dir override. Defaults to the bundled SPA. */
  distDir?: string
  /** CLI binary name. */
  command?: string
  /** Preferred dev-server port for the launcher SPA. */
  port?: number
  /** Port range for the launcher SPA dev server (e.g. `[9000, 9100]`). */
  portRange?: [number, number]
  /** Prefer a random port for the launcher SPA. */
  random?: boolean
}
