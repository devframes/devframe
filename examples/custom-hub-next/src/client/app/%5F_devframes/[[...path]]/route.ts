import { ensureNextDevframeHub } from '../../../devframe/next-devframe-hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The whole hub behind one route: `initHub`'s web-standard `handler` serves
 * every mounted devframe SPA (`/__devframes/git/…`, `/__devframes/terminals/…`,
 * the a11y agent module, …), each frame's `__connection.json`, the hub-level
 * discovery endpoints (`/__devframes/__connection.json`, `__index.json`,
 * `__client-imports.js`), and the aggregate MCP endpoint
 * (`/__devframes/__mcp`).
 *
 * Next.js reserves `_`-prefixed segment folders, so `__devframes` is
 * URL-encoded as `%5F_devframes` in the app directory name.
 *
 * MCP speaks Streamable-HTTP: `POST` (requests), `GET` (the SSE stream), and
 * `DELETE` (session teardown) all route to the same handler.
 */
async function handler(request: Request): Promise<Response> {
  const hub = await ensureNextDevframeHub()
  return hub.handler(request)
}

export { handler as DELETE, handler as GET, handler as POST }
