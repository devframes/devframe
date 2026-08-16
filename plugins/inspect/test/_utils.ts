import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeNodeContext } from 'devframe'
import type { StartedServer } from 'devframe/internal'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createHubContext } from '@devframes/hub/node'
import inspectDevframe from '@devframes/plugin-inspect'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { createH3DevframeHost } from 'devframe/internal'
import { createHostContext } from 'devframe/node'
import { resolveBasePath } from 'devframe/node/hub-internals'
import { resolveStaticAssetsSource } from 'devframe/utils/remote-assets'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'
import { serveTestContext } from '../../../tests/helpers/serve-test-context'

/**
 * Resolve the inspector's SPA to a local directory. Its `distDir` is a
 * remote-assets declaration; in this monorepo the lockstep
 * `@devframes/plugin-inspect--assets` package is workspace-linked, so
 * resolution short-circuits to its built `dist`. A store (rather than a
 * string) means that build hasn't run.
 */
function localSpaDir(): string {
  const resolved = resolveStaticAssetsSource(inspectDevframe.cli!.distDir!, path.join(os.tmpdir(), 'devframes_plugin_inspect-test'))
  if (typeof resolved !== 'string') {
    throw new TypeError(
      '[devframes_plugin_inspect] client SPA missing — run `pnpm -C plugins/inspect run build` first.',
    )
  }
  return resolved
}

/**
 * Assert the Vue SPA has been built. The dev-server and static-build
 * tests mount / copy the client SPA; a missing build produces a loud,
 * fixable failure rather than an opaque 404.
 */
export function assertSpaBuilt(): void {
  if (!existsSync(path.join(localSpaDir(), 'index.html'))) {
    throw new Error(
      '[devframes_plugin_inspect] client SPA missing — run `pnpm -C plugins/inspect run build` first.',
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
  const distDir = localSpaDir()
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

  const server = await serveTestContext({
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
