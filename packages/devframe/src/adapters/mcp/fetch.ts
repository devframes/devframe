import type { DevframeNodeContext, McpAuthorization } from 'devframe/types'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { timingSafeEqual } from 'devframe/utils/crypto-token'
import { isAllowedOrigin, isLoopbackAddress } from 'devframe/utils/origin'
import { bridgeListChanged, buildMcpServerFromContext } from './build-server'

export interface CreateMcpFetchHandlerOptions {
  /** Name reported in the MCP handshake. */
  serverName: string
  /** Version reported in the MCP handshake. */
  serverVersion: string
  /** Expose shared-state keys as MCP resources; see `buildMcpServerFromContext`. */
  exposeSharedState: boolean | ((key: string) => boolean)
  /**
   * Optional identity check, layered on top of the origin gate and checked
   * **after** it: a bearer token string (matched in constant time against
   * `Authorization: Bearer <token>`), a `(request) => boolean` callback, or
   * `false` (the default) for origin-only, trusting same-machine callers. A
   * callback governs identity only and cannot relax the origin gate. See
   * {@link McpAuthorization}.
   */
  authorization?: McpAuthorization
  /**
   * Origin allow-list beyond the loopback default. `false` disables the
   * origin gate entirely. Default: loopback-only.
   *
   * Unlike the WS transport, the MCP route does **not** allow `Origin`-less
   * requests: a route-based endpoint is reachable by any local process, so a
   * request must carry an `Origin` that passes the gate. Native clients
   * (e.g. `devframe connect`) send their loopback origin explicitly.
   */
  allowedOrigins?: readonly string[] | false
}

/**
 * Parse exactly one `Authorization: Bearer <token>` credential, returning the
 * token or `undefined` for a missing, malformed, empty, or multi-credential
 * header. The token itself is never logged. `\S+` rejects the whitespace that
 * a second credential (fetch merges duplicate headers as `a, b`) or an empty
 * value would introduce.
 */
function parseBearerToken(header: string | null): string | undefined {
  if (!header)
    return undefined
  const match = /^Bearer (\S+)$/i.exec(header.trim())
  return match ? match[1] : undefined
}

/**
 * Resolve the identity gate for one request. `false` is the origin-only
 * opt-out; a callback delegates identity; a string requires a constant-time
 * bearer match. Never reveals whether a supplied token was close to correct.
 */
async function isAuthorized(req: Request, authorization: McpAuthorization): Promise<boolean> {
  if (authorization === false)
    return true
  if (typeof authorization === 'function')
    return await authorization(req) === true
  const token = parseBearerToken(req.headers.get('authorization'))
  if (token === undefined)
    return false
  return timingSafeEqual(token, authorization)
}

/** Connection facts a host knows about a request beyond the `Request` itself. */
export interface McpConnectionInfo {
  /**
   * The connecting peer's remote address (a node socket's `remoteAddress`),
   * used to prove a same-machine caller when the endpoint relies on the
   * loopback origin default with no identity check. A host that can resolve a
   * trustworthy peer address (the h3/node mount) supplies it; when it's
   * omitted the origin gate stays the only locality signal.
   */
  remoteAddress?: string
}

export interface McpFetchHandler {
  /**
   * WHATWG-`fetch` handler for the MCP endpoint. Hand every method
   * (POST/GET/DELETE) on the endpoint's path to it; routing by path is the
   * host's job. Pass {@link McpConnectionInfo} when the host can resolve the
   * peer address so the default trust boundary can enforce same-machine
   * locality.
   */
  fetch: (request: Request, connection?: McpConnectionInfo) => Promise<Response>
  /** Tear down the handler (aborts in-flight exchanges, drops the change bridge). */
  dispose: () => Promise<void>
}

/**
 * Build a framework-agnostic MCP endpoint over a devframe context: a
 * web-standard `Request → Response` handler any host can mount: h3 (see
 * `mountMcpHttp`), a Next.js App Router route, or any other fetch-shaped
 * server.
 *
 * The endpoint is **stateless**: it serves the 2026-07-28 revision per request
 * through the SDK's {@link createMcpHandler}, which builds a fresh MCP server
 * (from the shared, live `ctx` via `buildMcpServerFromContext`) for each
 * request: no `Mcp-Session-Id` registry, no session-local routing, no
 * GET/DELETE teardown protocol. 2025-era clients are still served through the
 * SDK's default stateless legacy path. `list_changed` events reach modern
 * `subscriptions/listen` streams through the handler's `notify` bus.
 *
 * The origin gate guards every request: loopback-default DNS-rebinding
 * protection that (unlike the WS upgrade's `isAllowedOrigin`) also rejects
 * `Origin`-less requests, so a browser can't reach the route across origins (a
 * disallowed origin gets `403`). The `Origin` header is only browser hardening:
 * a non-browser client forges it. So on the zero-config default (no widened
 * `allowedOrigins`, no identity check) a second locality gate requires the
 * connected peer to be loopback, proven from the host-supplied
 * {@link McpConnectionInfo.remoteAddress} (which a client cannot forge), so the
 * "trusts same-machine callers" default holds against a remote raw client.
 * When same-machine isn't your trust boundary, add an identity gate
 * ({@link CreateMcpFetchHandlerOptions.authorization}), checked after the
 * origin gate: a bearer/callback check that proves *who* is calling (a
 * missing/invalid credential gets `401` with a `WWW-Authenticate: Bearer`
 * challenge), which also lifts the loopback-peer restriction for authenticated
 * callers.
 */
export function createMcpFetchHandler(
  ctx: DevframeNodeContext,
  options: CreateMcpFetchHandlerOptions,
): McpFetchHandler {
  const allowedOrigins = options.allowedOrigins
  // Origin-only by default: trust same-machine callers unless a bearer/callback
  // identity check is configured.
  const authorization = options.authorization ?? false

  const handler = createMcpHandler(() => buildMcpServerFromContext(ctx, {
    serverName: options.serverName,
    serverVersion: options.serverVersion,
    exposeSharedState: options.exposeSharedState,
  }))

  // A single, long-lived bridge from devframe's change events onto the
  // handler's `subscriptions/listen` bus, published once for the endpoint,
  // not per (ephemeral, per-request) server instance.
  const unbridge = bridgeListChanged(ctx, {
    tools: () => { handler.notify.toolsChanged() },
    resources: () => { handler.notify.resourcesChanged() },
  })

  // The zero-config trust boundary: no widened origin allow-list and no
  // identity check, so the endpoint trusts same-machine callers alone. A
  // loopback `Origin` is only browser hardening (a raw client forges it), so
  // here locality is proven from the connected peer instead.
  const originOnlyDefault = allowedOrigins === undefined && authorization === false

  async function handle(req: Request, connection?: McpConnectionInfo): Promise<Response> {
    // Origin gate: the endpoint's DNS-rebinding protection and its guard
    // against arbitrary local processes. Unlike the WS transport, an
    // `Origin`-less request is rejected: a route-based MCP endpoint would
    // otherwise be reachable by any local process. A request must carry an
    // `Origin` that is loopback or on the configured allow-list.
    const origin = req.headers.get('origin') ?? undefined
    if (allowedOrigins !== false && (origin === undefined || !isAllowedOrigin(origin, allowedOrigins ?? [])))
      return new Response('Forbidden', { status: 403 })

    // Locality gate: a raw client forges `Origin: http://localhost`, so when
    // that default is the only trust boundary, require the connected peer to be
    // loopback (an address it cannot forge). Opt out with `authorization` or
    // `allowedOrigins: false`; a host that can't resolve a peer stays
    // origin-only.
    if (originOnlyDefault && connection?.remoteAddress !== undefined && !isLoopbackAddress(connection.remoteAddress))
      return new Response('Forbidden', { status: 403 })

    // Identity gate: a request that cleared the origin check still has to
    // prove *who* it is. A generic 401 (with the `WWW-Authenticate` challenge)
    // whether the bearer is absent, malformed, or wrong: no response reveals
    // whether a supplied token was close to correct.
    if (!await isAuthorized(req, authorization))
      return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })

    return handler.fetch(req)
  }

  return {
    fetch: handle,
    dispose: async () => {
      unbridge()
      await handler.close()
    },
  }
}
