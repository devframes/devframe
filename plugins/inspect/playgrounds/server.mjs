#!/usr/bin/env node
/**
 * Standalone demo host for the Devframe Inspector.
 *
 * `initDevframe` runs setup, serves the built Vue panel SPA plus
 * `__connection.json` at the devframe base path, and binds the WebSocket RPC
 * upgrade onto the server, so the panel talks to a live backend:
 *
 *   GET  /__devframes_plugin_inspect/**  -> the Vue panel SPA (live RPC)
 */
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { initDevframe } from 'devframe/initiate'
import { getPort } from 'devframe/utils/get-port'
import { H3, toNodeHandler } from 'h3'
import { resolve } from 'pathe'
import createInspectDevframe from '../src/node/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '..')

const devframe = createInspectDevframe()
const basePath = devframe.basePath
const panelDir = resolve(ROOT, 'assets-pkg/dist')

async function main() {
  if (!existsSync(resolve(panelDir, 'index.html'))) {
    console.error('\n[inspect playground] missing built SPA\n  -> run `pnpm -C plugins/inspect build` first.\n')
    process.exit(1)
  }

  const bindHost = '0.0.0.0'
  const port = await getPort({ host: bindHost, port: 9012 })
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

  process.stdout.write(`\n  Devframe Inspector demo (live WebSocket RPC)\n  > panel:  ${origin}${basePath}\n\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
