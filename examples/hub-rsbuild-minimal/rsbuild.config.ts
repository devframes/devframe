import type { HubInstance } from '@devframes/hub/initiate'
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { defineConfig } from '@rsbuild/core'

// The one mount base, referenced by both `initHub({ base })` and the injected
// embedded-script URL — no duplicated string literal.
const base = DEVFRAMES_HUB_BASE

// The minimal Rsbuild host: one `initHub()` call mounted into the dev
// server's middleware stack. It's created lazily inside `server.setup` (not
// at module scope) so merely importing this config never spawns the hub's
// side-car server, and the `??=` keeps a re-run reusing the live one —
// config readers (Rsbuild, knip, tests) stay side-effect free. `initHub` runs
// here in Rsbuild's Node process, never bundled into the browser, so
// `createUi()`'s prebuilt assets and the plugins' node code work unchanged;
// the dock UI comes from `@devframes/hub-ui` via the `ui` slot.
let hub: HubInstance | undefined

export default defineConfig({
  source: { entry: { index: './src/index.ts' } },
  server: {
    // Runs before Rsbuild's built-in middlewares, so the hub owns
    // `/__devframes/*` and hands everything else back to Rsbuild via next().
    setup({ server }) {
      hub ??= initHub({
        base,
        devframes: [createInspectDevframe(), createMessagesDevframe()],
        ui: createUi(),
        // Single-user localhost demo: opts out of the gate. A hub reachable
        // beyond localhost should gate (see docs/guide/security.md).
        auth: false,
        // Rsbuild's middleware stack never hands over WebSocket upgrades, so
        // the socket gets its own side-car port, advertised through
        // `__connection.json`.
        ws: { sidecar: true },
      })
      server.middlewares.use(hub.nodeMiddleware)
    },
  },
  html: {
    title: 'Hub Rsbuild (minimal)',
    // The floating-dock bootstrap — one dev-only module script, the whole
    // embedded integration.
    tags: [
      { tag: 'script', attrs: { type: 'module', src: `${base}embedded.js` }, append: true },
    ],
  },
})
