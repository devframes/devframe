#!/usr/bin/env node
/**
 * Playground host for the Files Inspector: boots the built tool and serves its
 * SPA panel + live WebSocket RPC off one origin, mirroring how a hub would
 * mount it under the devframe base path.
 *
 *   node playgrounds/server.mjs   → serves `dist/client` with live RPC
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
    console.error(`\n[files-inspector playground] missing ${file}\n  → run \`${hint}\` first.\n`)
    process.exit(1)
  }
}

function banner(origin) {
  process.stdout.write(
    `\n  Files Inspector demo: dev (live WebSocket RPC)\n`
    + `  ▸ panel:  ${origin}${basePath}\n\n`,
  )
}

async function main() {
  requireBuilt(resolve(panelDir, 'index.html'), 'pnpm -C examples/files-inspector build')

  const bindHost = '0.0.0.0'
  const port = await getPort({ host: bindHost, port: 9876 })
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
