import type { StartedServer } from 'devframe/node'
import type { DevframeNodeContext } from 'devframe/types'
import type { GitDevframeOptions } from '../src/index'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import {
  createH3DevframeHost,
  createHostContext,
  startHttpAndWs,
} from 'devframe/node'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'
import { resolve } from 'pathe'
import { createGitDevframe } from '../src/index'

export interface DashboardServer extends StartedServer {
  basePath: string
}

/**
 * Build a node context rooted at `cwd`. Used directly by the build-dump test
 * and indirectly by {@link startDashboardServer}.
 */
export async function createDashboardContext(
  cwd: string,
  mode: 'dev' | 'build' = 'dev',
  options: GitDevframeOptions = {},
  app: H3 = new H3(),
): Promise<DevframeNodeContext> {
  const devframe = createGitDevframe(options)
  const h3Host = createH3DevframeHost({
    origin: 'http://127.0.0.1',
    appName: devframe.id,
    mount: (base, dir) => mountStaticHandler(app, base, dir),
  })
  const ctx = await createHostContext({ cwd, mode, host: h3Host })
  await devframe.setup(ctx)
  return ctx
}

/**
 * Boot the dashboard server in-process against `cwd`, mirroring the CLI
 * adapter's WS+HTTP wiring on a random free port. Bound to 127.0.0.1 to
 * avoid the IPv4/IPv6 race documented in devframe's ws transport tests.
 */
export async function startDashboardServer(
  cwd: string,
  options: GitDevframeOptions = {},
): Promise<DashboardServer> {
  const devframe = createGitDevframe(options)
  const distDir = devframe.cli!.distDir!
  // The factory leaves basePath adapter-resolved; standalone defaults to '/'.
  const basePath = devframe.basePath ?? '/'
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const h3Host = createH3DevframeHost({
    origin: `http://${host}:${port}`,
    appName: devframe.id,
    mount: (base, dir) => mountStaticHandler(app, base, dir),
  })
  const ctx = await createHostContext({ cwd, mode: 'dev', host: h3Host })
  await devframe.setup(ctx)

  const metaPath = `${basePath}${DEVFRAME_CONNECTION_META_FILENAME}`
  app.use(metaPath, () => ({ backend: 'websocket', websocket: port }))
  mountStaticHandler(app, basePath, resolve(distDir))

  const server = await startHttpAndWs({ context: ctx, host, port, app, auth: false })
  return Object.assign(server, { basePath })
}
