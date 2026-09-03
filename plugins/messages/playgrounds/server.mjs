#!/usr/bin/env node
/**
 * Standalone demo host for the messages panel.
 *
 * `initDevframe` runs setup, serves the built Vue panel SPA + `__connection.json`
 * from `assets-pkg/dist` under the devframe base path, and binds the WebSocket
 * RPC upgrade onto our http server. The dev harness seeds a demo feed since the
 * plugin itself is headless and reads whatever hub host it's mounted on.
 *
 *   node playgrounds/server.mjs   → live WebSocket RPC (`assets-pkg/dist`)
 */
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { initDevframe } from 'devframe/initiate'
import { getPort } from 'devframe/utils/get-port'
import { H3, toNodeHandler } from 'h3'
import { resolve } from 'pathe'
import { createMessagesDevDevframe } from '../app/dev-host.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '..')
const panelDir = resolve(ROOT, 'assets-pkg/dist')

const devframe = createMessagesDevDevframe()
const basePath = devframe.basePath

async function main() {
  if (!existsSync(resolve(panelDir, 'index.html'))) {
    console.error('\n[messages playground] missing assets-pkg/dist/index.html\n  → run `pnpm -C plugins/messages build` first.\n')
    process.exit(1)
  }

  const bindHost = '0.0.0.0'
  const port = await getPort({ host: bindHost, port: 4414 })
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

  process.stdout.write(`\n  Messages panel: dev (live WebSocket RPC)\n  ▸ panel:  ${origin}${basePath}\n\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
