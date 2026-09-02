import type { StartedServer } from 'devframe/internal'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { createH3DevframeHost } from 'devframe/internal'
import { createHostContext } from 'devframe/node'
import { getPort } from 'devframe/utils/get-port'
import { resolveStaticAssetsSource } from 'devframe/utils/remote-assets'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { H3 } from 'h3'
import { resolve } from 'pathe'
import { serveTestContext } from '../../../tests/helpers/serve-test-context'
import createA11yDevframe from '../src/index'

const devframe = createA11yDevframe()

/** Resolve the Solid panel SPA to a local dir - the workspace-linked `--assets` package in dev. */
function localSpaDir(): string {
  const resolved = resolveStaticAssetsSource(devframe.cli!.distDir!, resolve(os.tmpdir(), 'devframes_plugin_a11y-test'), devframe.importMetaUrl)
  if (typeof resolved !== 'string')
    throw new TypeError('[devframes_plugin_a11y] client SPA missing - run `pnpm -C plugins/a11y run build` first.')
  return resolved
}

/** Loud failure if the Solid panel hasn't been built - tests serve the client SPA. */
export function assertClientBuilt(): void {
  if (!existsSync(path.join(localSpaDir(), 'index.html'))) {
    throw new Error(
      '[devframes_plugin_a11y] client SPA missing - run `pnpm -C plugins/a11y run build` first.',
    )
  }
}

export interface InspectorServer extends StartedServer {
  basePath: string
}

/**
 * Boot the inspector dev server in-process, mirroring the CLI adapter's
 * wiring so tests exercise the same RPC + static path `node bin.mjs` does.
 * Bound to 127.0.0.1 to avoid the IPv4/IPv6 race documented in devframe's
 * ws transport tests.
 */
export async function startInspectorServer(): Promise<InspectorServer> {
  const distDir = localSpaDir()
  const basePath = devframe.basePath!
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevframeHost({
    origin,
    appName: devframe.id,
    mount: (base, dir) => {
      mountStaticHandler(app, base, dir)
    },
  })

  const ctx = await createHostContext({ cwd: process.cwd(), mode: 'dev', host: h3Host })
  await devframe.setup(ctx)

  app.use(`${basePath}${DEVFRAME_CONNECTION_META_FILENAME}`, () => ({ backend: 'websocket', websocket: port }))
  mountStaticHandler(app, basePath, resolve(distDir))

  const server = await serveTestContext({ context: ctx, host, port, app, auth: false })
  return Object.assign(server, { basePath })
}
