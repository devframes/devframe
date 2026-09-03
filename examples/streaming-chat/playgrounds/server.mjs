#!/usr/bin/env node
/**
 * Standalone demo host for the streaming-chat tool.
 *
 * Serves the built panel SPA at the devframe base path and binds the live
 * WebSocket RPC onto the same server, so the panel streams tokens from the
 * node side over a real connection:
 *
 *   GET  /__devframe-streaming-chat/**  → the Preact panel SPA + live RPC
 *
 *   node playgrounds/server.mjs   → live WebSocket RPC (`dist/client`)
 */
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { initDevframe } from 'devframe/initiate'
import { getPort } from 'devframe/utils/get-port'
import { H3, toNodeHandler } from 'h3'
import { resolve } from 'pathe'
import devframe from '../src/node/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '..')

const basePath = devframe.basePath
const panelDir = resolve(ROOT, 'dist/client')

function requireBuilt(file, hint) {
  if (!existsSync(file)) {
    console.error(`\n[streaming-chat playground] missing ${file}\n  → run \`${hint}\` first.\n`)
    process.exit(1)
  }
}

function banner(origin) {
  process.stdout.write(
    `\n  Streaming Chat demo: dev (live WebSocket RPC)\n`
    + `  ▸ panel:  ${origin}${basePath}\n\n`
    + '  Send a prompt to fake-stream a response one token at a time.\n\n',
  )
}

async function main() {
  requireBuilt(resolve(panelDir, 'index.html'), 'pnpm -C examples/streaming-chat build')

  const bindHost = '0.0.0.0'
  const port = await getPort({ host: bindHost, port: 9897 })
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
  banner(origin)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
