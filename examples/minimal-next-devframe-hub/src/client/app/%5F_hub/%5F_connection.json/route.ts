import { ensureMinimalNextDevframeHub } from '../../../devframe/minimal-next-devframe-hub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const hub = await ensureMinimalNextDevframeHub()
  return Response.json(hub.connectionMeta)
}
