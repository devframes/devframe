import { ensureNextDevframeHub } from '../../../devframe/next-devframe-hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The hub client (`app/page.tsx`) discovers the side-car WS endpoint here. The
 * `@devframes/next` bridge answers it — `/__hub` is registered as a connection
 * base in the host setup — so this delegates to the same `fetch` as the
 * catch-all SPA route.
 */
export async function GET(request: Request): Promise<Response> {
  const hub = await ensureNextDevframeHub()
  return hub.fetch(request)
}
