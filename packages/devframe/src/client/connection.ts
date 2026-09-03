import type { ConnectionMeta } from 'devframe/types'
import {
  DEVFRAME_CONNECTION_META_FILENAME,
  DEVFRAME_VIEWER_ORIGIN_QUERY_PARAM,
  DEVFRAME_VIEWER_ORIGIN_TOKEN_QUERY_PARAM,
} from 'devframe/constants'
import { withBase } from 'ufo'
import {
  readStoredAuthToken,
  readStoredConnection,
  readStoredConnectionMeta,
  storeConnection,
} from './connection-storage'

export interface DevframeConnection {
  /** Server-advertised transport and serialization metadata. */
  connectionMeta: ConnectionMeta
  /**
   * Absolute URL of the `__connection.json` that produced
   * {@link connectionMeta}. Relative transport paths and side-car ports are
   * resolved from this URL, rather than from an external viewer's location.
   */
  metaBaseUrl: string
  /** Previously issued bearer token, when the connection is already trusted. */
  authToken?: string
}

export interface SetupDevframeConnectionOptions {
  /** Reuse a complete connection prepared in another viewer or JavaScript realm. */
  connection?: DevframeConnection
  /** Use a pre-known descriptor while deriving its source URL from `baseURL`. */
  connectionMeta?: ConnectionMeta
  /** Base URL, or fallback list, used to locate `__connection.json`. */
  baseURL?: string | string[]
  /** Override the locally stored auth token. */
  authToken?: string
}

/**
 * Allow an external viewer to connect by registering its browser origin with
 * the Devframe host. Returns `false` if the host did not provide an origin
 * registration token.
 */
export async function registerDevframeViewerOrigin(
  connection: DevframeConnection,
  origin = globalThis.location?.origin,
): Promise<boolean> {
  const token = connection.connectionMeta.viewerOriginToken
  if (!token || !origin)
    return false

  const url = new URL(connection.metaBaseUrl)
  url.searchParams.set(DEVFRAME_VIEWER_ORIGIN_QUERY_PARAM, origin)
  url.searchParams.set(DEVFRAME_VIEWER_ORIGIN_TOKEN_QUERY_PARAM, token)
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok)
    throw new Error(`Failed to register external viewer origin (${response.status}).`)
  return true
}

function resolveMetaBaseUrl(baseURL: string): string {
  const metaPath = withBase(DEVFRAME_CONNECTION_META_FILENAME, baseURL)
  try {
    return new URL(metaPath, globalThis.location?.href).href
  }
  catch {
    return metaPath
  }
}

function withAuthToken(
  connection: DevframeConnection,
  authToken: string | undefined,
): DevframeConnection {
  return authToken && authToken !== connection.authToken
    ? { ...connection, authToken }
    : connection
}

/**
 * Return connection information previously prepared in this window or an
 * accessible parent window.
 */
export function getDevframeConnection(): DevframeConnection | undefined {
  const connection = readStoredConnection()
  if (connection) {
    return withAuthToken(
      connection,
      readStoredAuthToken()
      ?? connection.authToken
      ?? connection.connectionMeta.authToken,
    )
  }

  const connectionMeta = readStoredConnectionMeta()
  if (!connectionMeta)
    return undefined

  return {
    connectionMeta,
    metaBaseUrl: connectionMeta.baseUrl ?? resolveMetaBaseUrl('./'),
    authToken: readStoredAuthToken(connectionMeta.authToken),
  }
}

/**
 * Prepare the connection information shared by a devframe client and external
 * viewers. Reuses an explicit or previously prepared connection before
 * fetching `__connection.json` from the configured base URLs.
 */
export async function setupDevframeConnection(
  options: SetupDevframeConnectionOptions = {},
): Promise<DevframeConnection> {
  if (options.connection) {
    const connection = withAuthToken(
      options.connection,
      readStoredAuthToken(
        options.authToken
        ?? options.connection.authToken
        ?? options.connection.connectionMeta.authToken,
      ),
    )
    storeConnection(connection)
    return connection
  }

  const bases = Array.isArray(options.baseURL)
    ? options.baseURL
    : [options.baseURL ?? './']

  if (options.connectionMeta) {
    const connection: DevframeConnection = {
      connectionMeta: options.connectionMeta,
      /**
       * Preserve the established connectionMeta behavior: an explicitly
       * supplied descriptor resolves from the caller's explicit base.
       */
      metaBaseUrl: resolveMetaBaseUrl(bases[0] ?? './'),
      authToken: readStoredAuthToken(
        options.authToken ?? options.connectionMeta.authToken,
      ),
    }
    storeConnection(connection)
    return connection
  }

  const existing = getDevframeConnection()
  if (existing) {
    const connection = withAuthToken(
      existing,
      readStoredAuthToken(
        options.authToken
        ?? existing.authToken
        ?? existing.connectionMeta.authToken,
      ),
    )
    storeConnection(connection)
    return connection
  }

  const errors: Error[] = []
  for (const base of bases) {
    const metaPath = withBase(DEVFRAME_CONNECTION_META_FILENAME, base)
    const metaUrl = resolveMetaBaseUrl(base)
    try {
      const response = await fetch(metaPath)
      if (!response.ok)
        throw new Error(`Failed to fetch connection meta from ${metaUrl}: ${response.status}`)

      const connectionMeta = await response.json() as ConnectionMeta
      const connection: DevframeConnection = {
        connectionMeta,
        metaBaseUrl: response.url || metaUrl,
        authToken: readStoredAuthToken(
          options.authToken ?? connectionMeta.authToken,
        ),
      }
      storeConnection(connection)
      return connection
    }
    catch (error) {
      errors.push(error as Error)
    }
  }

  throw new Error(`Failed to get connection meta from ${bases.join(', ')}`, {
    cause: errors,
  })
}

/**
 * The connection lifecycle of a devframe client, as a single value a UI can
 * render from. Derived from the transport (WebSocket open/close/error) and the
 * trust handshake, so a viewer never has to reason about the two dimensions
 * separately.
 *
 * - `connecting`: establishing the WebSocket / running the initial trust
 *   handshake. Calls issued here queue until the socket opens.
 * - `connected`: socket open and trusted; RPC calls will be served.
 * - `unauthorized`: socket open but the server rejected trust (no valid token,
 *   or an auth-enforcing host refused it). Calls fail fast with an auth error;
 *   the UI should prompt for re-authentication or a reload.
 * - `disconnected`: the socket closed (dropped mid-session, or never opened).
 *   Pending and new calls fail fast until the page reconnects.
 * - `error`: a fatal connection error (e.g. the WebSocket errored, or the
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
 * - `connection`: the transport dropped, errored, or never opened.
 * - `auth`: the server rejected trust for this client.
 * - `timeout`: a call exceeded its {@link DevframeRpcClientOptions.callTimeout}.
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
