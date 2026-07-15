/**
 * The connection lifecycle of a devframe client, as a single value a UI can
 * render from. Derived from the transport (WebSocket open/close/error) and the
 * trust handshake, so a viewer never has to reason about the two dimensions
 * separately.
 *
 * - `connecting` — establishing the WebSocket / running the initial trust
 *   handshake. Calls issued here queue until the socket opens.
 * - `connected` — socket open and trusted; RPC calls will be served.
 * - `unauthorized` — socket open but the server rejected trust (no valid token,
 *   or an auth-enforcing host refused it). Calls fail fast with an auth error;
 *   the UI should prompt for re-authentication or a reload.
 * - `disconnected` — the socket closed (dropped mid-session, or never opened).
 *   Pending and new calls fail fast until the page reconnects.
 * - `error` — a fatal connection error (e.g. the WebSocket errored, or the
 *   connection meta could not be loaded).
 *
 * A `static` backend has no live socket, so it reports `connected` for its
 * whole life.
 */
export type DevframeConnectionStatus
  = | 'connecting'
    | 'connected'
    | 'unauthorized'
    | 'disconnected'
    | 'error'

/**
 * What kind of failure a {@link DevframeConnectionError} describes:
 * - `connection` — the transport dropped, errored, or never opened.
 * - `auth` — the server rejected trust for this client.
 * - `timeout` — a call exceeded its {@link DevframeRpcClientOptions.callTimeout}.
 */
export type DevframeConnectionErrorKind
  = | 'connection'
    | 'auth'
    | 'timeout'

/**
 * The error rejected from `rpc.call(...)` (and carried on
 * `rpc.connectionError`) when a call cannot be served because the connection is
 * down, the client is unauthorized, or a call timed out. Its `kind` lets a UI
 * tailor its message and recovery affordance without string-matching.
 */
export class DevframeConnectionError extends Error {
  override name = 'DevframeConnectionError'
  readonly kind: DevframeConnectionErrorKind

  constructor(kind: DevframeConnectionErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.kind = kind
  }
}

/**
 * Whether a status means calls can be attempted. `connecting` counts because
 * the transport queues outgoing calls until the socket opens; the terminal
 * failure states short-circuit calls so a stuck socket never hangs the UI.
 */
export function isCallableStatus(status: DevframeConnectionStatus): boolean {
  return status === 'connected' || status === 'connecting'
}
