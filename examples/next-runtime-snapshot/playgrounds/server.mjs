#!/usr/bin/env node
/**
 * Standalone demo host for the Next Runtime Snapshot panel.
 *
 * `initDevframe` runs setup, serves the built Next.js panel SPA +
 * `__connection.json` from `dist/client` under the devframe base path, and
 * binds the WebSocket RPC upgrade onto our http server.
 *
 *   node playgrounds/server.mjs   → live WebSocket RPC (`dist/client`)
 */
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { initDevframe } from 'devframe/initiate'
import { getPort } from 'get-port-please'
import { H3, toNodeHandler } from 'h3'
import devframe from '../src/node/index.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const panelDir = resolve(ROOT, 'dist/client')

const basePath = devframe.basePath

async function main() {
  if (!existsSync(resolve(panelDir, 'index.html'))) {
    console.error('\n[next-runtime-snapshot playground] missing dist/client/index.html\n  → run `pnpm -C examples/next-runtime-snapshot build` first.\n')
    process.exit(1)
  }

  const bindHost = '0.0.0.0'
  const port = await getPort({ host: bindHost, port: 9899 })
  const origin = `http://localhost:${port}`

  const app = new H3()
  const server = createServer(toNodeHandler(app))
  const instance = initDevframe(devframe, {
    base: basePath,
    distDir: panelDir,
    app,
    server,
    host: bindHost,
    origin,
    auth: false,
  })
  await new Promise(r => server.listen(port, bindHost, r))
  await instance.ready

  process.stdout.write(`\n  Next Runtime Snapshot: dev (live WebSocket RPC)\n  ▸ panel:  ${origin}${basePath}\n\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
