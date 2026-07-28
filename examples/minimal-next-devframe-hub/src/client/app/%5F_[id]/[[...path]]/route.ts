import { ensureMinimalNextDevframeHub } from '../../../devframe/minimal-next-devframe-hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Catch-all for every mounted devframe SPA (`/__git/…`, `/__terminals/…`, the
 * a11y agent module, …) and their `<base>/__connection.json` discovery fetches.
 * The `@devframes/next` bridge owns all of it — static serving (with SPA
 * fallback, content types, and traversal guarding via devframe's shared
 * `serveStaticHandler`) and the connection-meta responses.
 */
export async function GET(request: Request): Promise<Response> {
  const hub = await ensureMinimalNextDevframeHub()
  return hub.fetch(request)
}
