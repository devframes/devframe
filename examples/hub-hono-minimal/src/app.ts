import type { HubInstance } from '@devframes/hub/initiate'
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createA11yDevframe } from '@devframes/plugin-a11y'
import { createAssetsDevframe } from '@devframes/plugin-assets'
import { createCodeServerDevframe } from '@devframes/plugin-code-server'
import { createDataInspectorDevframe } from '@devframes/plugin-data-inspector'
import { createGitDevframe } from '@devframes/plugin-git'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { createOgDevframe } from '@devframes/plugin-og'
import { createTerminalsDevframe } from '@devframes/plugin-terminals'
import { Hono } from 'hono'

// One runtime-agnostic app file: the hub instance and the Hono routes are
// the same on Node and Bun. No transport option is passed, so the hub binds
// nothing on its own — `src/server.ts` hands it the HTTP server's upgrade
// events with `hub.attach(server)` once that server exists.
//
// Memoized on globalThis so a dev-time module reload returns the live hub
// instead of leaking transports.
const globalRef = globalThis as { __hubHonoMinimal?: HubInstance }

export const hub: HubInstance = globalRef.__hubHonoMinimal ??= initHub({
  base: DEVFRAMES_HUB_BASE,
  // Every built-in plugin, dogfooded end to end through the hub mount path.
  // `data-inspector`'s default id carries `:` (a route-param marker), so it
  // gets a colon-free id override to be a valid `<base><id>/` segment; the
  // assets watcher is off since this host demonstrates mounting, not authoring.
  devframes: [
    createGitDevframe(),
    createTerminalsDevframe(),
    createCodeServerDevframe(),
    createInspectDevframe(),
    createDataInspectorDevframe({ id: 'devframes_plugin_data-inspector' }),
    createA11yDevframe(),
    createMessagesDevframe(),
    createOgDevframe(),
    createAssetsDevframe({ watch: false }),
  ],
  // Rebrand the reference UI to Hono's own orange — one field, no CSS:
  // `createUi`'s `branding` option publishes `branding.json`, which the dock
  // fetches at boot and feeds into `--devframe-primary` (see
  // `@devframes/hub-ui`'s `primary-ramp.css`).
  ui: createUi({ branding: { primaryColor: '#e36002', productName: 'Devframes on Hono' } }),
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
// than a repeated string.
app.all(hub.base.replace(/\/$/, ''), c => hub.handler(c.req.raw))
app.all(`${hub.base}*`, c => hub.handler(c.req.raw))

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
