/** Stable devframe id for the code-server plugin. */
export const PLUGIN_ID = 'devframes-plugin-code-server'

/**
 * Shared-state key holding the serializable, secret-free server status and
 * detection result. The authentication cookie is never published here — it
 * is returned only from the `start` / `status` RPCs to the already-authorized
 * client (see {@link CodeServerAuth}).
 */
export const STATE_KEY = 'devframes-plugin-code-server:state'

/** Default dev-server port for the plugin's own launcher SPA (standalone CLI). */
export const DEFAULT_PORT = 9013

/** Preferred port for the spawned code-server process (falls back if taken). */
export const DEFAULT_CODE_SERVER_PORT = 8080

/** How long to wait for code-server to answer its `/healthz` probe. */
export const DEFAULT_START_TIMEOUT = 30_000

/** code-server's session cookie base name (see `getCookieSessionName`). */
export const SESSION_COOKIE_BASE = 'code-server-session'

/**
 * Compute code-server's session cookie name for an optional `--cookie-suffix`.
 * Mirrors code-server's own `getCookieSessionName` so the client sets the
 * exact cookie the server reads.
 */
export function getCookieSessionName(suffix?: string): string {
  return suffix
    ? `${SESSION_COOKIE_BASE}-${suffix.replace(/[^a-z0-9-]/gi, '-')}`
    : SESSION_COOKIE_BASE
}
