import type { DevframeNodeContext } from 'devframe/types'
import type { H3, H3Event } from 'h3'
import type { CreateMcpFetchHandlerOptions } from './fetch'
import { defineHandler } from 'h3'
import { createMcpFetchHandler } from './fetch'

export interface MountMcpHttpOptions extends CreateMcpFetchHandlerOptions {}

export interface MountedMcpHttp {
  /** Tear down every live MCP session (closes servers, drops subscriptions). */
  dispose: () => Promise<void>
}

/**
 * Mount an MCP Streamable-HTTP endpoint on an h3 app at `path` — the h3
 * binding over {@link createMcpFetchHandler}, which owns the sessions, the
 * origin gate, and the transport plumbing.
 *
 * The handler is web-standard — it takes the h3 event's web `Request` and
 * returns a web `Response` (an SSE `ReadableStream` body for the
 * server→client stream). We copy that response onto `event.res` and return
 * its body rather than returning the `Response` object directly, so a
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
  const handler = createMcpFetchHandler(ctx, options)

  app.use(path, defineHandler(async event => respond(event, await handler.fetch(event.req))))

  return {
    dispose: handler.dispose,
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
