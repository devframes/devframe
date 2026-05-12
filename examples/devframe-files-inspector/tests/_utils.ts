import type { StartedServer } from 'devframe/node'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEVTOOLS_CONNECTION_META_FILENAME,
} from 'devframe/constants'
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

/**
 * Asserts the Preact client has been built. Tests boot a dev server
 * that serves files from `dist/client`; if the build is missing the
 * failure message is loud enough to tell the contributor what to run.
 */
export function assertClientBuilt(): void {
  if (!existsSync(path.join(CLIENT_DIST, 'index.html'))) {
    throw new Error(
      `[devframe-files-inspector] dist/client missing — run \`pnpm -C examples/devframe-files-inspector run build\` first.`,
    )
  }
}

/**
 * Create a tmp dir seeded with a known set of files so list-files RPC
 * has predictable output.
 */
export async function makeFixtureCwd(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'devframe-files-inspector-'))
  await writeFile(path.join(dir, 'package.json'), '{"name":"fixture"}\n')
  await writeFile(path.join(dir, 'sample.txt'), 'hello\n')
  await writeFile(path.join(dir, 'README.md'), '# fixture\n')
  return dir
}

export interface InspectorServer extends StartedServer {
  basePath: string
}

/**
 * Boot the inspector dev server in-process. Mirrors the cli adapter's
 * runDevServer wiring so tests exercise the same RPC + static path the
 * real `node bin.mjs` does, but with a controllable lifecycle.
 *
 * Bound to 127.0.0.1 explicitly to avoid the IPv4/IPv6 race documented
 * in `packages/devframe/src/rpc/transports/ws.test.ts`.
 */
export async function startInspectorServer(
  { cwd }: { cwd: string },
): Promise<InspectorServer> {
  const distDir = devframe.cli!.distDir!
  const basePath = devframe.basePath!
  const host = '127.0.0.1'
  const port = await getPort({ host, random: true })

  const app = new H3()
  const origin = `http://${host}:${port}`
  const h3Host = createH3DevToolsHost({
    origin,
    appName: devframe.id,
    mount: (base, dir) => {
      mountStaticHandler(app, base, dir)
    },
  })

  const ctx = await createHostContext({ cwd, mode: 'dev', host: h3Host })
  await devframe.setup(ctx)

  const metaPath = `${basePath}${DEVTOOLS_CONNECTION_META_FILENAME}`
  app.use(metaPath, () => ({ backend: 'websocket', websocket: port }))
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
