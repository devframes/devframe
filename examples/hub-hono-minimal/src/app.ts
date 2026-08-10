import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { Hono } from 'hono'

// One runtime-agnostic app file: the hub instance and the Hono routes are
// identical on Node (`src/node.ts`) and Bun (`src/bun.ts`) — only the
// WebSocket transport differs, and the instance resolves that itself
// (eager side-car port on Node, fetch-upgrade on Bun).
//
// `key` memoizes the instance on globalThis so dev-time module reloads
// return the live hub instead of leaking transports.
export const hub = initHub({
  key: 'hub-hono-minimal',
  base: DEVFRAMES_HUB_BASE,
  devframes: [
    createInspectDevframe(),
    createMessagesDevframe(),
  ],
  ui: createUi(),
  // Single-user localhost demo: reachable only on loopback, so it opts out
  // of the gate for a no-friction dev experience. A hub reachable beyond
  // localhost should gate (see docs/guide/security.md).
  auth: false,
  configure(ctx) {
    ctx.commands.register({
      id: 'example:hub-hono-minimal:ping',
      title: 'Hono Hub · Ping',
      icon: 'ph:bell-duotone',
      category: 'kit',
      handler: () => 'pong',
    })
    ctx.rpc.register({
      name: 'example:hub-hono-minimal:probe',
      type: 'query',
      jsonSerializable: true,
      handler: () => 'pong',
    })
  },
})

export const app = new Hono()

// The whole hub namespace behind one catch-all, keyed off `hub.base` rather
// than a repeated string. On Bun, `c.env` is the `Bun.serve` server — the
// instance uses it to complete same-origin WebSocket upgrades; on Node it's
// simply unused.
app.all(hub.base.replace(/\/$/, ''), c => hub.handler(c.req.raw, c.env))
app.all(`${hub.base}*`, c => hub.handler(c.req.raw, c.env))

// The host app: any page becomes devtools-equipped with one script tag.
app.get('/', c => c.html(
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hono Devframe Hub</title>
  </head>
  <body style="font-family: system-ui; padding: 2rem">
    <h1>Hono Devframe Hub</h1>
    <p>This page is the host app. The devtools ride along:</p>
    <ul>
      <li>the floating dock (bottom of this page) is <code>/__devframes/embedded.js</code></li>
      <li>the standalone viewer lives at <a href="/__devframes/">/__devframes/</a></li>
      <li>discovery: <a href="/__devframes/__index.json">__index.json</a> · <a href="/__devframes/__connection.json">__connection.json</a></li>
    </ul>
    <script type="module" src="/__devframes/embedded.js"></script>
  </body>
</html>`,
))
