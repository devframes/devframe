import type { DevframeNodeContext } from 'devframe/types'
import { randomUUID } from 'node:crypto'
import { isInitializeRequest, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import { isAllowedOrigin } from 'devframe/rpc/transports/ws-server'
import { timingSafeEqual } from 'devframe/utils/crypto-token'
import { buildMcpServerFromContext } from './build-server'

export interface CreateMcpFetchHandlerOptions {
  /** Name reported in the MCP handshake. */
  serverName: string
  /** Version reported in the MCP handshake. */
  serverVersion: string
  /** Expose shared-state keys as MCP resources — see `buildMcpServerFromContext`. */
  exposeSharedState: boolean | ((key: string) => boolean)
  /**
   * Origin allow-list beyond the loopback default. `false` disables the
   * origin gate entirely. Default: loopback-only (mirrors the WS transport).
   */
  allowedOrigins?: readonly string[] | false
  /**
   * Bearer token every request must present as `Authorization: Bearer
   * <token>`. This is the endpoint's real authentication: the origin gate
   * only ever constrains browsers (a non-browser client can omit or spoof the
   * `Origin` header), so without a token any local process could reach every
   * tool. Callers that expose the route mint a high-entropy token and hand it
   * to trusted clients out-of-band (devframe records it in the instance
   * registry so `devframe connect` can present it). Leave unset only for a
   * transport that is already authenticated by other means.
   */
  authToken?: string
}

export interface McpFetchHandler {
  /**
   * WHATWG-`fetch` handler for the MCP Streamable-HTTP endpoint. Hand every
   * method (POST/GET/DELETE) on the endpoint's path to it — routing by path
   * is the host's job.
   */
  fetch: (request: Request) => Promise<Response>
  /** Tear down every live MCP session (closes servers, drops subscriptions). */
  dispose: () => Promise<void>
}

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport
  dispose: () => Promise<void>
}

/**
 * Build a framework-agnostic MCP Streamable-HTTP endpoint over a devframe
 * context: a web-standard `Request → Response` handler any host can mount —
 * h3 (see `mountMcpHttp`), a Next.js App Router route, or any other
 * fetch-shaped server.
 *
 * Each MCP session gets its own {@link WebStandardStreamableHTTPServerTransport}
 * and MCP server (built from the shared, live `ctx` via
 * `buildMcpServerFromContext`), correlated by the `Mcp-Session-Id` header: an
 * `initialize` POST spins up a session; later requests route to it; a `DELETE`
 * (or client disconnect) tears it down. Two gates guard every request: the
 * origin gate applies devframe's loopback-default DNS-rebinding protection
 * (identical semantics to the WS upgrade's `isAllowedOrigin`, and only ever
 * constrains browsers), and — when {@link CreateMcpFetchHandlerOptions.authToken}
 * is set — a constant-time `Authorization: Bearer` check that is the endpoint's
 * real authentication for non-browser clients.
 *
 * @experimental
 */
export function createMcpFetchHandler(
  ctx: DevframeNodeContext,
  options: CreateMcpFetchHandlerOptions,
): McpFetchHandler {
  const sessions = new Map<string, McpSession>()
  const allowedOrigins = options.allowedOrigins
  const authToken = options.authToken

  /**
   * Constant-time check of the request's `Authorization: Bearer <token>`
   * against the expected token. Returns `true` when no token is configured
   * (the caller opted out of endpoint auth).
   */
  function isAuthorized(req: Request): boolean {
    if (!authToken)
      return true
    const header = req.headers.get('authorization') ?? ''
    const prefix = 'bearer '
    if (header.slice(0, prefix.length).toLowerCase() !== prefix)
      return false
    return timingSafeEqual(header.slice(prefix.length).trim(), authToken)
  }

  function drop(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session)
      return
    sessions.delete(sessionId)
    void session.dispose()
  }

  async function createSession(): Promise<McpSession> {
    // Declared up front so the transport's session callbacks can capture it;
    // it's assigned before any of them can fire (they run during
    // `handleRequest`, after `connect` below).
    let session!: McpSession

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, session)
      },
      onsessionclosed: (id) => {
        drop(id)
      },
    })

    const { server, dispose } = buildMcpServerFromContext(ctx, {
      serverName: options.serverName,
      serverVersion: options.serverVersion,
      exposeSharedState: options.exposeSharedState,
    })

    session = {
      transport,
      dispose: async () => {
        dispose()
        await server.close()
      },
    }

    transport.onclose = () => {
      if (transport.sessionId)
        drop(transport.sessionId)
    }

    await server.connect(transport)
    return session
  }

  async function handle(req: Request): Promise<Response> {
    // Origin gate — identical semantics to the WS upgrade's `isAllowedOrigin`
    // (loopback + `Origin`-less native clients + the configured allow-list).
    // This is the endpoint's DNS-rebinding protection.
    const origin = req.headers.get('origin') ?? undefined
    if (allowedOrigins !== false && !isAllowedOrigin(origin, allowedOrigins ?? []))
      return new Response('Forbidden: origin not allowed', { status: 403 })

    // Bearer-token gate — the actual authentication (see `authToken` above).
    // The origin gate above is defense-in-depth against browsers only.
    if (!isAuthorized(req))
      return new Response('Unauthorized: missing or invalid bearer token', { status: 401 })

    const sessionId = req.headers.get('mcp-session-id') ?? undefined
    let session = sessionId ? sessions.get(sessionId) : undefined

    // A POST may carry an `initialize` request that opens a brand-new
    // session. Parse the body once and hand it to the transport as
    // `parsedBody` (the web Request body can only be consumed once).
    if (!session && req.method === 'POST') {
      let body: unknown
      try {
        body = await req.json()
      }
      catch {
        body = undefined
      }

      if (!sessionId && isInitializeRequest(body)) {
        session = await createSession()
      }
      else {
        return new Response(
          sessionId
            ? 'Not Found: unknown MCP session'
            : 'Bad Request: no valid session ID and not an initialize request',
          { status: sessionId ? 404 : 400 },
        )
      }

      return session.transport.handleRequest(req, { parsedBody: body })
    }

    if (!session) {
      // GET (open the SSE stream) / DELETE (end the session) require a
      // known session id.
      return new Response(
        sessionId
          ? 'Not Found: unknown MCP session'
          : 'Bad Request: missing MCP session ID',
        { status: sessionId ? 404 : 400 },
      )
    }

    return session.transport.handleRequest(req)
  }

  return {
    fetch: handle,
    dispose: async () => {
      const live = [...sessions.values()]
      sessions.clear()
      await Promise.all(live.map(session => session.dispose()))
    },
  }
}
