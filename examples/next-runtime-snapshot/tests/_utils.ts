import type { StartedServer } from 'devframe/node'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { DEVTOOLS_CONNECTION_META_FILENAME } from 'devframe/constants'
import {
  createH3DevToolsHost,
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
  const distDir = devframe.cli!.distDir!
  const basePath = devframe.basePath!
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevToolsHost({
    origin,
    appName: devframe.id,
    mount: (base, dir) => mountStaticHandler(app, base, dir),
  })

  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
  await devframe.setup(ctx)

  const metaPath = `${basePath}${DEVTOOLS_CONNECTION_META_FILENAME}`
  app.use(metaPath, () => ({ backend: 'websocket', websocket: port }))
  // Mount the static handler unconditionally — it only stat()s on
  // request, so a missing dist just produces 404s for HTML routes.
  // RPC-only tests don't fetch the SPA, so they're unaffected.
  mountStaticHandler(app, basePath, resolve(distDir))

  const server = await startHttpAndWs({
    context: ctx,
    host,
    port,
    app,
    auth: false,
  })

  return Object.assign(server, { basePath })
}
