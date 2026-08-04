import type { DevframeNodeContext } from 'devframe/types'
import { randomUUID } from 'node:crypto'
import { isInitializeRequest, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import { isAllowedOrigin } from 'devframe/rpc/transports/ws-server'
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
   * origin gate entirely. Default: loopback-only.
   *
   * Unlike the WS transport, the MCP route does **not** allow `Origin`-less
   * requests: a route-based endpoint is reachable by any local process, so a
   * request must carry an `Origin` that passes the gate. Native clients
   * (e.g. `devframe connect`) send their loopback origin explicitly.
   */
  allowedOrigins?: readonly string[] | false
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
 * (or client disconnect) tears it down. The origin gate guards every request:
 * loopback-default DNS-rebinding protection that — unlike the WS upgrade's
 * `isAllowedOrigin` — also rejects `Origin`-less requests, so a route-based
 * endpoint isn't reachable by an arbitrary local process.
 *
 * @experimental
 */
export function createMcpFetchHandler(
  ctx: DevframeNodeContext,
  options: CreateMcpFetchHandlerOptions,
): McpFetchHandler {
  const sessions = new Map<string, McpSession>()
  const allowedOrigins = options.allowedOrigins

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
    // Origin gate — the endpoint's DNS-rebinding protection and its guard
    // against arbitrary local processes. Unlike the WS transport, an
    // `Origin`-less request is rejected: a route-based MCP endpoint would
    // otherwise be reachable by any local process. A request must carry an
    // `Origin` that is loopback or on the configured allow-list.
    const origin = req.headers.get('origin') ?? undefined
    if (allowedOrigins !== false && (origin === undefined || !isAllowedOrigin(origin, allowedOrigins ?? [])))
      return new Response('Forbidden: origin required', { status: 403 })

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
