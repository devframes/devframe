#!/usr/bin/env node
/**
 * Same-origin demo host for the a11y inspector.
 *
 * Serves three things off one origin so the injected agent (host page) and the
 * panel (devtools iframe) share a BroadcastChannel:
 *
 *   GET  /                              → the demo page (intentional a11y bugs)
 *   GET  /__df-inject/inject.js         → the injected agent bundle
 *   GET  /__devframes_plugin_a11y/**  → the Solid panel SPA
 *
 * Two modes prove the plugin works either way:
 *
 *   node demo/server.mjs          dev    — live WebSocket RPC (`assets-pkg/dist`)
 *   node demo/server.mjs build    static — baked RPC dump,    (`dist/static`)
 *
 * The scan/highlight loop is identical in both: it rides the BroadcastChannel,
 * not the devframe backend.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { initDevframe } from 'devframe/initiate'
import { getPort } from 'devframe/utils/get-port'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { H3, toNodeHandler } from 'h3'
import { resolve } from 'pathe'
import createA11yDevframe from '../src/index.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '..')

const devframe = createA11yDevframe()
const mode = process.argv[2] === 'build' ? 'build' : 'dev'
const basePath = devframe.basePath
const injectDir = resolve(ROOT, 'dist/inject')
const panelDir = mode === 'build' ? resolve(ROOT, 'dist/static') : resolve(ROOT, 'assets-pkg/dist')

function requireBuilt(file, hint) {
  if (!existsSync(file)) {
    console.error(`\n[a11y-inspector demo] missing ${file}\n  → run \`${hint}\` first.\n`)
    process.exit(1)
  }
}

function banner(origin) {
  const label = mode === 'build' ? 'static build (baked RPC dump)' : 'dev (live WebSocket RPC)'
  process.stdout.write(
    `\n  A11y Inspector demo — ${label}\n`
    + `  ▸ host app + docked panel:  ${origin}/\n`
    + `  ▸ panel only:               ${origin}${basePath}\n\n`
    + '  Hover a violation in the panel to highlight its element in the page.\n\n',
  )
}

async function main() {
  requireBuilt(resolve(injectDir, 'inject.js'), 'pnpm -C plugins/a11y build')
  requireBuilt(
    resolve(panelDir, 'index.html'),
    mode === 'build'
      ? 'pnpm -C plugins/a11y build && pnpm -C plugins/a11y cli:build'
      : 'pnpm -C plugins/a11y build',
  )

  const bindHost = '0.0.0.0'
  const port = await getPort({ host: bindHost, port: 4477 })
  const demoHtml = await readFile(resolve(HERE, 'index.html'), 'utf-8')

  const app = new H3()

  // 1. The demo host page (exact `/`).
  app.use('/', (event) => {
    event.res.headers.set('content-type', 'text/html; charset=utf-8')
    return demoHtml
  })

  // 2. The injected agent bundle.
  mountStaticHandler(app, '/__df-inject/', injectDir)

  if (mode === 'dev') {
    const origin = `http://localhost:${port}`
    // 3a. `initDevframe` runs setup, serves the panel SPA + `__connection.json`
    // on our shared app, and binds the WS RPC upgrade onto our server.
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
  else {
    // 3b. Static build already carries its own __connection.json + __rpc-dump.
    mountStaticHandler(app, basePath, panelDir)
    const server = createServer(toNodeHandler(app))
    await new Promise(r => server.listen(port, bindHost, r))
    banner(`http://localhost:${port}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
