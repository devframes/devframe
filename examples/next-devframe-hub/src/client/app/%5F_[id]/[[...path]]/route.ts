import { ensureNextDevframeHub } from '../../../devframe/next-devframe-hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Catch-all for every mounted devframe SPA (`/__git/…`, `/__terminals/…`, the
 * a11y agent module, …), their `<base>/__connection.json` discovery fetches,
 * and the in-process MCP endpoint (`/__hub/__mcp`). The `@devframes/next`
 * bridge owns all of it — static serving (with SPA fallback, content types,
 * and traversal guarding via devframe's shared `serveStaticHandler`), the
 * connection-meta responses, and the MCP mount.
 *
 * MCP speaks Streamable-HTTP: `POST` (requests), `GET` (the SSE stream), and
 * `DELETE` (session teardown) all route to the same bridge `fetch`.
 */
async function handler(request: Request): Promise<Response> {
  const hub = await ensureNextDevframeHub()
  return hub.fetch(request)
}

export { handler as DELETE, handler as GET, handler as POST }
