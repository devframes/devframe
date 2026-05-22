import { ensureMinimalNextDevToolsHub } from '../../../devtools/minimal-next-devtools-hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const hub = await ensureMinimalNextDevToolsHub()
  return Response.json(hub.connectionMeta)
}
