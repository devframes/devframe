import type { StartedServer } from 'devframe/internal'
import process from 'node:process'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { createH3DevframeHost } from 'devframe/internal'
import { createHostContext } from 'devframe/node'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'
import { resolve } from 'pathe'
import { serveTestContext } from '../../../tests/helpers/serve-test-context'
import devframe from '../src/devframe'

export interface SnapshotServer extends StartedServer {
  basePath: string
}

/**
 * Boot the snapshot server in-process. Mirrors the cli adapter's wiring
 * so the WS+HTTP path is exercised end-to-end, with a random free port
 * so tests can run in parallel.
 *
 * Bound to 127.0.0.1 to avoid the IPv4/IPv6 race documented in
 * `packages/devframe/src/rpc/transports/ws.test.ts`.
 */
export async function startSnapshotServer(): Promise<SnapshotServer> {
  const distDir = devframe.clientAssets!
  if (typeof distDir !== 'string')
    throw new TypeError('these tests serve the local dist directory — build the SPA first')
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
  // Mount the static handler unconditionally — it only stat()s on
  // request, so a missing dist just produces 404s for HTML routes.
  // RPC-only tests don't fetch the SPA, so they're unaffected.
  mountStaticHandler(app, basePath, resolve(distDir))

  const server = await serveTestContext({
    context: ctx,
    host,
    port,
    app,
    auth: false,
  })

  return Object.assign(server, { basePath })
}
