import type { DevframeHubContext } from '@devframes/hub/node'
import type { StartedServer } from 'devframe/node'
import type { DevframeNodeContext } from 'devframe/types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createHubContext } from '@devframes/hub/node'
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

export interface InspectorServer<Ctx extends DevframeNodeContext = DevframeNodeContext> extends StartedServer {
  basePath: string
  ctx: Ctx
}

interface BootOptions {
  /** Build the node context. Default: devframe's plain `createHostContext`. */
  hub?: boolean
}

/**
 * Boot the inspector dev server in-process, mirroring the CLI adapter's
 * wiring (`auth: false` so the standalone server auto-trusts) but with a
 * controllable lifecycle. Bound to 127.0.0.1 to avoid the IPv4/IPv6 race.
 *
 * With `hub: true` the context comes from `@devframes/hub`'s
 * `createHubContext`, so `ctx.commands` is a live host — the surface the
 * Commands tab reads from when mounted inside a hub. Without it, the plain
 * context exercises the no-hub path (empty list, thrown diagnostic).
 */
async function boot(options: BootOptions): Promise<InspectorServer> {
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

  const ctx = options.hub
    ? await createHubContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
    : await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
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

  return Object.assign(server, { basePath, ctx })
}

/** Standalone boot — plain devframe context, no hub commands host. */
export function startInspectorServer(): Promise<InspectorServer> {
  return boot({})
}

/** Hub boot — `createHubContext` attaches a live `ctx.commands` host. */
export async function startInspectorHubServer(): Promise<InspectorServer<DevframeHubContext>> {
  return await boot({ hub: true }) as InspectorServer<DevframeHubContext>
}
