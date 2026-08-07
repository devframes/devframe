import { Server as NodeHttpServer } from 'node:http'
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { defineConfig } from 'vite'

// The one mount base, referenced by both `initHub({ base })` and the injected
// embedded-script URL — no duplicated string literal.
const base = DEVFRAMES_HUB_BASE

// The minimal Vite host: one `initHub()` call mounted as connect middleware
// on the Vite dev server. `initHub` runs here in Vite's Node config process
// (never bundled into the browser), so `createUi()`'s prebuilt-asset lookup
// and the plugins' node code work unchanged. The WebSocket upgrade shares
// Vite's own dev server at `/__devframes/__ws` (zero extra ports); the dock
// UI comes from `@devframes/hub-ui` via the `ui` slot.
export default defineConfig({
  // Dev tooling reached from arbitrary hostnames (LAN IPs, tunnels): accept
  // any Host header and fall back to the next free port when busy.
  server: { allowedHosts: true, strictPort: false },
  plugins: [{
    name: 'hub-vite-minimal',
    apply: 'serve',
    configureServer(server) {
      const hub = initHub({
        key: 'hub-vite-minimal',
        base,
        devframes: [createInspectDevframe(), createMessagesDevframe()],
        ui: createUi(),
        // Single-user localhost demo: reachable only on loopback, so it opts
        // out of the gate. A hub reachable beyond localhost should gate (see
        // docs/guide/security.md).
        auth: false,
        // Share Vite's own HTTP server for the WS upgrade; a plain-HTTP dev
        // server (an https/http2 one wouldn't match) falls back to the eager
        // side-car inside initHub.
        server: server.httpServer instanceof NodeHttpServer ? server.httpServer : undefined,
      })
      // Self-filters by base and calls next() otherwise, so Vite keeps serving
      // the host page and its assets while the hub owns `/__devframes/*`.
      server.middlewares.use(hub.nodeMiddleware)
    },
    // Inject the floating-dock bootstrap into the host page — one dev-only
    // module script, the whole embedded integration.
    transformIndexHtml() {
      return [{
        tag: 'script',
        attrs: { type: 'module', src: `${base}embedded.js` },
        injectTo: 'body',
      }]
    },
  }],
})
