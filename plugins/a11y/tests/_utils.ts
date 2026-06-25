import type { StartedServer } from 'devframe/node'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { createH3DevframeHost, createHostContext, startHttpAndWs } from 'devframe/node'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'
import { resolve } from 'pathe'
import devframe from '../src/index'

const HERE = fileURLToPath(new URL('.', import.meta.url))
export const SPA_DIST = resolve(HERE, '../dist/spa')

/** Loud failure if the Solid panel hasn't been built — tests serve `dist/spa`. */
export function assertClientBuilt(): void {
  if (!existsSync(path.join(SPA_DIST, 'index.html'))) {
    throw new Error(
      '[devframe-a11y-inspector] dist/spa missing — run `pnpm -C plugins/a11y run build` first.',
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
  const distDir = devframe.cli!.distDir!
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

  const server = await startHttpAndWs({ context: ctx, host, port, app, auth: false })
  return Object.assign(server, { basePath })
}
