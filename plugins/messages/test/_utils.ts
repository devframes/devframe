import type { DevframeHubContext } from '@devframes/hub/node'
import type { StartedServer } from 'devframe/node'
import type { DevframeNodeContext } from 'devframe/types'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createHubContext } from '@devframes/hub/node'
import messagesDevframe from '@devframes/plugin-messages'
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

const SPA_DIST = messagesDevframe.cli!.distDir!

/**
 * Assert the Vue SPA has been built. The dev-server and static-build
 * tests mount / copy `dist/spa`; a missing build produces a loud, fixable
 * failure rather than an opaque 404.
 */
export function assertSpaBuilt(): void {
  if (!existsSync(path.join(SPA_DIST, 'index.html'))) {
    throw new Error(
      '[devframes_plugin_messages] dist/spa missing — run `pnpm -C plugins/messages run build` first.',
    )
  }
}

export interface MessagesServer<Ctx extends DevframeNodeContext = DevframeNodeContext> extends StartedServer {
  basePath: string
  ctx: Ctx
}

interface BootOptions {
  /** Build the node context. Default: devframe's plain `createHostContext`. */
  hub?: boolean
}

/**
 * Boot the messages panel server in-process, mirroring the CLI adapter's
 * wiring (`auth: false` so the standalone server auto-trusts) but with a
 * controllable lifecycle. Bound to 127.0.0.1 to avoid the IPv4/IPv6 race.
 *
 * With `hub: true` the context comes from `@devframes/hub`'s
 * `createHubContext`, so `ctx.messages` is a live host — the shape the
 * plugin is designed for. Without it, the plain context exercises the
 * warn-and-noop path.
 */
async function boot(options: BootOptions): Promise<MessagesServer> {
  const distDir = messagesDevframe.cli!.distDir!
  const basePath = resolveBasePath(messagesDevframe, 'standalone')
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevframeHost({
    origin,
    appName: messagesDevframe.id,
    workspaceRoot: await mkdtemp(path.join(os.tmpdir(), 'devframes_plugin_messages-test-')),
    mount: (base, dir) => {
      mountStaticHandler(app, base, dir)
    },
  })

  const ctx = options.hub
    ? await createHubContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
    : await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
  await messagesDevframe.setup(ctx)

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

/** Standalone boot — plain devframe context, no messages host (noop path). */
export function startMessagesServer(): Promise<MessagesServer> {
  return boot({})
}

/** Hub boot — `createHubContext` attaches a live `ctx.messages` host. */
export async function startMessagesHubServer(): Promise<MessagesServer<DevframeHubContext>> {
  return await boot({ hub: true }) as MessagesServer<DevframeHubContext>
}
