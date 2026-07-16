import type { StartedServer } from 'devframe/node'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import inspectDevframe from '@devframes/plugin-inspect'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import {
  createH3DevframeHost,
  createHostContext,
  startHttpAndWs,
} from 'devframe/node'
import { resolveBasePath } from 'devframe/node/hub-internals'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'

const SPA_DIST = inspectDevframe.cli!.distDir!

/**
 * Assert the Vue SPA has been built. The dev-server and static-build
 * tests mount / copy `dist/spa`; a missing build produces a loud, fixable
 * failure rather than an opaque 404.
 */
export function assertSpaBuilt(): void {
  if (!existsSync(path.join(SPA_DIST, 'index.html'))) {
    throw new Error(
      '[devframes_plugin_inspect] dist/spa missing — run `pnpm -C plugins/inspect run build` first.',
    )
  }
}

export interface InspectorServer extends StartedServer {
  basePath: string
}

/**
 * Boot the inspector dev server in-process, mirroring the CLI adapter's
 * wiring (`auth: false` so the standalone server auto-trusts) but with a
 * controllable lifecycle. Bound to 127.0.0.1 to avoid the IPv4/IPv6 race.
 */
export async function startInspectorServer(): Promise<InspectorServer> {
  const distDir = inspectDevframe.cli!.distDir!
  const basePath = resolveBasePath(inspectDevframe, 'standalone')
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevframeHost({
    origin,
    appName: inspectDevframe.id,
    mount: (base, dir) => {
      mountStaticHandler(app, base, dir)
    },
  })

  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
  await inspectDevframe.setup(ctx)

  const metaPath = `${basePath}${DEVFRAME_CONNECTION_META_FILENAME}`
  app.use(metaPath, () => ({ backend: 'websocket', websocket: port }))
  mountStaticHandler(app, basePath, path.resolve(distDir))

  const server = await startHttpAndWs({
    context: ctx,
    host,
    port,
    app,
    auth: false,
  })

  return Object.assign(server, { basePath })
}
