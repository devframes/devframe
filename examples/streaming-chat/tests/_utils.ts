import type { StartedServer } from 'devframe/node'
import type { DevframeNodeContext } from 'devframe/types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  DEVFRAME_CONNECTION_META_FILENAME,
} from 'devframe/constants'
import {
  createH3DevframeHost,
  createHostContext,
  startHttpAndWs,
} from 'devframe/node'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'
import { resolve } from 'pathe'
import devframe from '../src/devframe'

const HERE = fileURLToPath(new URL('.', import.meta.url))
export const CLIENT_DIST = resolve(HERE, '../dist/client')

/**
 * Boot the streaming-chat server in-process for tests. Mirrors the
 * cli adapter wiring so the WS+HTTP path is exercised end-to-end.
 *
 * Bound to 127.0.0.1 to avoid the IPv4/IPv6 race documented in
 * `packages/devframe/src/rpc/transports/ws.test.ts`.
 */
export async function startStreamingChatServer(): Promise<StartedServer & {
  basePath: string
  ctx: DevframeNodeContext
}> {
  // Build the client only if a test exercises the served HTML — RPC-only
  // tests don't need the dist (we don't call assertClientBuilt unless the
  // test fetches index.html).
  const distDir = devframe.cli!.distDir!
  const basePath = devframe.basePath!
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevframeHost({
    origin,
    appName: devframe.id,
    mount: (base, dir) => mountStaticHandler(app, base, dir),
  })

  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
  await devframe.setup(ctx)

  const metaPath = `${basePath}${DEVFRAME_CONNECTION_META_FILENAME}`
  app.use(metaPath, () => ({ backend: 'websocket', websocket: port }))
  if (existsSync(path.join(resolve(distDir), 'index.html'))) {
    mountStaticHandler(app, basePath, resolve(distDir))
  }

  const server = await startHttpAndWs({
    context: ctx,
    host,
    port,
    app,
    auth: false,
  })

  return Object.assign(server, { basePath, ctx })
}
