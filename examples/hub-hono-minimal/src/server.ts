import type { Server } from 'node:http'
import process from 'node:process'
import { serve } from '@hono/node-server'
import { app, hub } from './app'

// One entry for both runtimes — `tsx src/server.ts` on Node,
// `bun src/server.ts` on Bun. `serve()` hands back the `node:http` server it
// listens on, and `hub.attach()` routes that server's upgrade events to the
// shared RPC socket at `/__devframes/__ws`: same origin as the app, no
// side-car port to discover. A host that can't reach its server this way asks
// for one instead with `ws: { sidecar: true }`.
const port = Number(process.env.PORT ?? 5179)

// `serve()` returns `ServerType` (its http/http2 union); the default is a
// plain `node:http` server, which is what `hub.attach` routes upgrades on.
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }) as unknown as Server
const detach = hub.attach(server)

process.on('SIGINT', () => {
  detach()
  void hub.close().finally(() => process.exit(0))
})

void hub.ready.then(() => {
  // eslint-disable-next-line no-console
  console.log(`hono-devframe-hub on http://localhost:${port} — devtools at /__devframes/`)
})
