import type { DevframeNodeContext } from 'devframe/types'
import type { H3, H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { isAllowedOrigin } from 'devframe/rpc/transports/ws-server'
import { defineHandler } from 'h3'
import { buildMcpServerFromContext } from './build-server'

export interface MountMcpHttpOptions {
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
}

export interface MountedMcpHttp {
  /** Tear down every live MCP session (closes servers, drops subscriptions). */
  dispose: () => Promise<void>
}

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport
  dispose: () => Promise<void>
}

/**
 * Mount an MCP Streamable-HTTP endpoint on an h3 app at `path`.
 *
 * Each MCP session gets its own {@link WebStandardStreamableHTTPServerTransport}
 * and MCP server (built from the shared, live `ctx` via
 * `buildMcpServerFromContext`), correlated by the `Mcp-Session-Id` header:
 * an `initialize` POST spins up a session; later requests route to it; a
 * `DELETE` (or client disconnect) tears it down.
 *
 * The transport is web-standard — its `handleRequest` takes the h3 event's
 * web `Request` and returns a web `Response` (an SSE `ReadableStream` body
 * for the server→client stream). We copy that response onto `event.res` and
 * return its body rather than returning the `Response` object directly, so a
 * legitimate MCP 404 (unknown session) isn't swallowed by h3's
 * "Response-with-404 falls through to the next handler" rule (which would
 * otherwise hand the request to the SPA static catch-all).
 *
 * @experimental
 */
export function mountMcpHttp(
  app: H3,
  ctx: DevframeNodeContext,
  path: string,
  options: MountMcpHttpOptions,
): MountedMcpHttp {
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

  app.use(path, defineHandler(async (event) => {
    const req = event.req

    // Origin gate — identical semantics to the WS upgrade's `isAllowedOrigin`
    // (loopback + `Origin`-less native clients + the configured allow-list).
    // This is the endpoint's DNS-rebinding protection.
    const origin = req.headers.get('origin') ?? undefined
    if (allowedOrigins !== false && !isAllowedOrigin(origin, allowedOrigins ?? [])) {
      event.res.status = 403
      return 'Forbidden: origin not allowed'
    }

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
        event.res.status = sessionId ? 404 : 400
        return sessionId
          ? 'Not Found: unknown MCP session'
          : 'Bad Request: no valid session ID and not an initialize request'
      }

      return respond(event, await session.transport.handleRequest(req, { parsedBody: body }))
    }

    if (!session) {
      // GET (open the SSE stream) / DELETE (end the session) require a
      // known session id.
      event.res.status = sessionId ? 404 : 400
      return sessionId
        ? 'Not Found: unknown MCP session'
        : 'Bad Request: missing MCP session ID'
    }

    return respond(event, await session.transport.handleRequest(req))
  }))

  return {
    dispose: async () => {
      const live = [...sessions.values()]
      sessions.clear()
      await Promise.all(live.map(session => session.dispose()))
    },
  }
}

/**
 * Copy a web `Response` from the MCP transport onto the h3 event's response
 * and return its body. Returning the body (a `ReadableStream` or `null`)
 * rather than the `Response` object avoids h3's 404-fall-through behavior.
 */
function respond(event: H3Event, response: Response): ReadableStream | string {
  event.res.status = response.status
  event.res.statusText = response.statusText
  response.headers.forEach((value, key) => {
    event.res.headers.set(key, value)
  })
  // h3 middleware only falls through on `undefined`; return `''` (not
  // `null`) for empty bodies so the response terminates the chain with the
  // status/headers we set above rather than continuing to the SPA static
  // catch-all.
  return response.body ?? ''
}
