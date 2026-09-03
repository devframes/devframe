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

// Memoized on globalThis so a dev-time reload reuses the hub instead of
// leaking transports. No `ws` option, so the hub binds nothing itself;
// `src/server.ts` hands it Fastify's `node:http` server via `hub.attach`,
// putting the RPC socket on the app's origin with no side-car port.
const globalRef = globalThis as { __hubFastifyMinimal?: HubInstance }

export const hub: HubInstance = globalRef.__hubFastifyMinimal ??= initHub({
  base: DEVFRAMES_HUB_BASE,
  /**
   * Every built-in plugin, dogfooded end to end through the hub mount path.
   * `data-inspector`'s default id carries `:` (a route-param marker), so it
   * gets a colon-free id override to be a valid `<base><id>/` segment; the
   * assets watcher is off since this host demonstrates mounting, not authoring.
   */
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
  /**
   * Rebrand the reference UI to Fastify's own black in one field, no CSS:
   * `createUi`'s `branding` option publishes `ConnectionMeta.configs.ui.branding`,
   * which the dock reads at connect time and feeds into `--devframe-primary`
   * (see `@devframes/hub-ui`'s `primary-ramp.css`).
   */
  ui: createUi({ branding: { primaryColor: '#2f2f2f', productName: 'Devframes on Fastify' } }),
  /**
   * Gate with devframe's interactive OTP (the default). The hub prints a
   * 6-digit code + magic link on startup, and the reference UI's authorization
   * view exchanges it for a bearer token. See docs/content/1.guide/13.security.md.
   */
  configure(ctx) {
    ctx.commands.register({
      id: 'example:hub-fastify:ping',
      title: 'Fastify Hub · Ping',
      icon: 'ph:bell-duotone',
      category: 'kit',
      handler: () => 'pong',
    })
  },
})

/** The host page: one script tag turns any page into a devtools host. */
export const hostPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fastify Devframe Hub</title>
  </head>
  <body style="font-family: system-ui; padding: 2rem">
    <h1>Fastify Devframe Hub</h1>
    <p>This page is the host app. The devtools ride along:</p>
    <ul>
      <li>the floating dock (bottom of this page) is <code>/__devframes/embedded.js</code></li>
      <li>the standalone hub UI lives at <a href="/__devframes/">/__devframes/</a></li>
      <li>discovery: <a href="/__devframes/__index.json">__index.json</a> · <a href="/__devframes/__connection.json">__connection.json</a></li>
    </ul>
    <script type="module" src="/__devframes/embedded.js"></script>
  </body>
</html>`
