/** Lifecycle state of the managed editor process. */
export type CodeServerStatus = 'stopped' | 'starting' | 'running' | 'error'

/**
 * Which editor server binary the plugin launches in `mode: 'local'`:
 *
 * - `'code-server'` — Coder's open-source
 *   [code-server](https://github.com/coder/code-server) (`code-server …`). The
 *   plugin runs it with password auth and hands the client a session cookie, so
 *   the embedded editor opens already signed in.
 * - `'code-serve-web'` — Microsoft's official
 *   [`code serve-web`](https://code.visualstudio.com/docs/remote/vscode-server)
 *   (ships with the `code` CLI). The plugin generates a connection token and
 *   hands it to the client as a `?tkn=` query parameter.
 */
export type CodeServerBackend = 'code-server' | 'code-serve-web'

/**
 * How the editor is served:
 *
 * - `'local'` — a local server ({@link CodeServerBackend}) embedded from this
 *   machine's origin.
 * - `'tunnel'` — Microsoft's `code tunnel`, which registers a remote tunnel and
 *   embeds the hosted `vscode.dev` editor. First launch prints a device-login
 *   prompt (surfaced as {@link CodeServerLogin}); authentication is handled by
 *   `vscode.dev` itself, not this plugin.
 */
export type CodeServerMode = 'local' | 'tunnel'

/**
 * Result of probing the host for a usable editor binary. Drives the launcher
 * UI: when `installed` is false the SPA renders install instructions instead of
 * a launch button.
 */
export interface CodeServerDetection {
  /** Whether detection has run at least once on this context. */
  checked: boolean
  /** Whether the resolved binary reported a version. */
  installed: boolean
  /** Version string reported by `<bin> --version`, when installed. */
  version?: string
  /** The binary name / path probed. */
  bin: string
  /** The resolved backend (meaningful in `mode: 'local'`). */
  backend: CodeServerBackend
  /** The resolved mode. */
  mode: CodeServerMode
}

/**
 * A device-login prompt emitted by `code tunnel` on first launch. Surfaced to
 * the client so the user can complete authentication in their browser.
 */
export interface CodeServerLogin {
  /** The verification URL to open (e.g. `https://github.com/login/device`). */
  url: string
  /** The one-time code to enter there. */
  code: string
}

/** Serializable, secret-free description of the editor process. */
export interface CodeServerServerInfo {
  status: CodeServerStatus
  /** Port the local server is bound to, when starting/running. */
  port?: number
  /** Epoch ms the current process was started. */
  startedAt?: number
  /** OS process id, when running. */
  pid?: number
  /** Last error message, when `status === 'error'`. */
  error?: string
  /** Device-login prompt while a tunnel is authenticating. */
  login?: CodeServerLogin
}

/**
 * The full shared-state payload broadcast to subscribed clients. Deliberately
 * carries no authentication material — see {@link CodeServerConnect}.
 */
export interface CodeServerSharedState {
  detection: CodeServerDetection
  server: CodeServerServerInfo
}

/**
 * How the client reaches the running editor. May carry a secret (session
 * cookie or connection token), so it is returned only from the `start` /
 * `status` RPCs to the already-authorized client — never published to shared
 * state.
 *
 * - `url` set → embed it verbatim (tunnel mode's `vscode.dev` URL).
 * - otherwise → the client builds `<page-origin-host>:<port><path>` and, when
 *   `cookie` is present, sets it (cookies are port-agnostic, so a cookie set on
 *   the launcher's origin reaches the editor on its own port) before loading.
 */
export interface CodeServerConnect {
  /** Absolute URL to embed. When set, used verbatim (tunnel mode). */
  url?: string
  /** Path + query to open relative to the editor origin (local mode). */
  path?: string
  /** Session cookie to set before the iframe loads (`code-server` backend). */
  cookie?: { name: string, value: string }
}

/** Result of the `status` query — shared state plus connect info when running. */
export interface CodeServerStatusResult extends CodeServerSharedState {
  connect?: CodeServerConnect
}

/** Result of the `start` action — identical shape to {@link CodeServerStatusResult}. */
export type CodeServerStartResult = CodeServerStatusResult

/** Wire payload for the `start` RPC. */
export interface CodeServerStartRequest {
  /** Workspace folder to open. Defaults to the configured / context cwd. */
  folder?: string
}

/** Options accepted by {@link import('./index').createCodeServerDevframe}. */
export interface CodeServerOptions {
  /**
   * How the editor is served (default `'local'`). `'tunnel'` uses Microsoft's
   * `code tunnel` and embeds `vscode.dev`.
   */
  mode?: CodeServerMode
  /**
   * Which local server to launch in `mode: 'local'`. When unset, the plugin
   * auto-detects: it prefers `code-server` on PATH, then falls back to the
   * `code` CLI's `serve-web`.
   */
  backend?: CodeServerBackend
  /**
   * Editor binary to detect and launch. Defaults to the resolved backend's
   * binary (`code-server` or `code`), or `code` in tunnel mode.
   */
  bin?: string
  /** Workspace folder the editor opens. Defaults to `ctx.cwd`. */
  cwd?: string
  /** Force a specific server port (local mode). Defaults to a free port near 8080. */
  serverPort?: number
  /** Host the local server binds to. Defaults to `127.0.0.1`. */
  host?: string
  /** Extra CLI arguments forwarded verbatim to the editor binary. */
  args?: string[]
  /** Environment variables merged into the editor process. */
  env?: Record<string, string>
  /**
   * `--cookie-suffix` passed to `code-server`, isolating its session cookie
   * from other local code-server instances. `code-server` backend only.
   */
  cookieSuffix?: string
  /** Milliseconds to wait for the editor to become ready before failing. */
  startTimeout?: number
  /** Launch the editor automatically when the plugin is set up, rather than on demand. */
  startOnBoot?: boolean
  /**
   * When the target port already answers a health probe, adopt that running
   * server instead of spawning a new one. Auto-authentication applies only to
   * servers this plugin launches, so an adopted server opens with whatever auth
   * it was started with.
   */
  reuseExistingServer?: boolean
  /** Options for `mode: 'tunnel'`. */
  tunnel?: CodeServerTunnelOptions
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

/** Options for `mode: 'tunnel'`. */
export interface CodeServerTunnelOptions {
  /**
   * The machine name registered with the tunnel service and used to build the
   * `vscode.dev/tunnel/<name>` URL. Defaults to the device hostname.
   */
  name?: string
}
