import type { Server } from 'node:http'
import process from 'node:process'
import { serve } from '@hono/node-server'
import { app, hub } from './app'

// One entry for both runtimes - `tsx` on Node, `bun` on Bun. `hub.attach()`
// routes the server's upgrade events to the shared RPC socket on the app's
// own origin; a host that can't reach its server asks for a side-car with
// `ws: { sidecar: true }`.
const port = Number(process.env.PORT ?? 5179)

// `serve()` returns `ServerType`; its default member is the `node:http`
// server `hub.attach` routes upgrades on.
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }) as Server
const detach = hub.attach(server)

process.on('SIGINT', () => {
  detach()
  void hub.close().finally(() => process.exit(0))
})

void hub.ready.then(() => {
  // eslint-disable-next-line no-console
  console.log(`hono-devframe-hub on http://localhost:${port} - devtools at /__devframes/`)
})
