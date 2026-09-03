#!/usr/bin/env node
/**
 * Standalone demo host for the SSE-only tool.
 *
 * Serves the built SPA at the devframe base path and the SSE RPC on the same
 * origin, so the panel reaches the node side over plain HTTP (`ws: false`):
 *
 *   GET  /__sse-basic/**  → the vanilla SPA + `__connection.json` + `__sse`
 *
 *   node playgrounds/server.mjs   → SSE RPC (`dist/client`)
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

const basePath = '/__sse-basic/'
const panelDir = resolve(ROOT, 'dist/client')

function requireBuilt(file, hint) {
  if (!existsSync(file)) {
    console.error(`\n[sse-basic playground] missing ${file}\n  → run \`${hint}\` first.\n`)
    process.exit(1)
  }
}

function banner(origin) {
  process.stdout.write(
    `\n  SSE Basic demo: SSE-only RPC (ws: false)\n`
    + `  ▸ panel:  ${origin}${basePath}\n\n`
    + '  The server clock ticks over the SSE event stream; no WebSocket anywhere.\n\n',
  )
}

async function main() {
  requireBuilt(resolve(panelDir, 'index.html'), 'pnpm -C examples/sse-basic build')

  const bindHost = '0.0.0.0'
  const port = await getPort({ host: bindHost, port: 9898 })
  const origin = `http://localhost:${port}`

  const app = new H3()
  const server = createServer(toNodeHandler(app))
  const instance = initDevframe(devframe, {
    base: basePath,
    ws: false,
    distDir: panelDir,
    app,
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
