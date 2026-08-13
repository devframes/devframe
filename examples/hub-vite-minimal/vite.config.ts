import type { DevframeJsonRenderSpec } from '@devframes/json-render'
import type { DevframeJsonRenderDockEntry } from '@devframes/json-render/hub'
import { Server as NodeHttpServer } from 'node:http'
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { defineConfig } from 'vite'

// The one mount base, referenced by both `initHub({ base })` and the injected
// embedded-script URL — no duplicated string literal.
const base = DEVFRAMES_HUB_BASE

// A server-authored JSON-render dock: the whole view is this serializable
// spec — no client build. It renders through whatever `'json-render'`
// renderer the hub composes (below, the reference `@devframes/json-render-ui`
// module); without one, the viewer shows its missing-renderer fallback.
const jsonRenderSpec: DevframeJsonRenderSpec = {
  root: 'root',
  elements: {
    root: { type: 'Card', props: { title: 'JSON Render' }, children: ['body'] },
    body: { type: 'Stack', props: { gap: 8 }, children: ['text', 'badge'] },
    text: { type: 'Text', props: { text: 'This dock is a JSON spec authored on the server and rendered by the module composed via initHub({ renderers }).' }, children: [] },
    badge: { type: 'Badge', props: { text: 'renderer manifest', variant: 'info' }, children: [] },
  },
}

const jsonRenderDock: DevframeJsonRenderDockEntry = {
  type: 'json-render',
  id: 'json-render-demo',
  title: 'JSON Render',
  icon: 'ph:layout-duotone',
  view: { spec: jsonRenderSpec },
}

// The minimal Vite host: one `initHub()` call mounted as connect middleware
// on the Vite dev server, created inside `configureServer` so importing this
// config never boots a hub. `initHub` runs here in Vite's Node config process
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
      // Share Vite's own HTTP server for the WS upgrade at
      // `/__devframes/__ws` — zero extra ports. Only a plain-HTTP dev server
      // qualifies (an https/http2 one isn't a `node:http` server), so an
      // auto-port side-car covers the rest; either way the browser finds the
      // socket through `__connection.json`.
      const httpServer = server.httpServer instanceof NodeHttpServer ? server.httpServer : undefined
      const hub = initHub({
        base,
        devframes: [createInspectDevframe(), createMessagesDevframe()],
        ui: createUi(),
        // Serve the reference json-render frontend as a prebuilt renderer
        // module — the one-liner that makes `'json-render'` docks render in
        // the prebuilt viewer. Swap it for any community implementation of
        // the same contract.
        renderers: [jsonRenderUiRenderer()],
        configure(ctx) {
          ctx.docks.register(jsonRenderDock)
        },
        // Single-user localhost demo: reachable only on loopback, so it opts
        // out of the gate. A hub reachable beyond localhost should gate (see
        // docs/guide/security.md).
        auth: false,
        server: httpServer,
        ...(httpServer ? {} : { ws: { sidecar: true } }),
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
