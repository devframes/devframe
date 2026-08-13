import { ensureHub } from '../../../hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The whole hub namespace behind one catch-all route: `initHub`'s
// web-standard `handler` serves every frame SPA, the discovery endpoints,
// and the embedded/viewer UI. Next reserves `_`-prefixed segment folders,
// so `__devframes` is URL-encoded as `%5F_devframes` in the app directory.
// MCP would speak Streamable-HTTP over GET/POST/DELETE - the same handler.
async function handler(request: Request): Promise<Response> {
  const hub = await ensureHub()
  return hub.handler(request)
}

export { handler as DELETE, handler as GET, handler as POST }
