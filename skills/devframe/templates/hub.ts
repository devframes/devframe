// Compose many devframes into one devtools host behind a single standard
// handler. Every mounted devframe runs against ONE shared hub context:
// a merged RPC registry (frames can call each other), one shared-state
// store, one WebSocket transport, and one auth gate.
//
// `hub.handler` is a Web-Standard `(request: Request) => Promise<Response>`;
// mount it on a catch-all route (Hono, Nitro, Next, SvelteKit, ...) exactly
// like an `initDevframe` instance. `hub.nodeMiddleware` is the Connect-style
// form for Vite/Rsbuild. See docs/content/2.adapters/1.initiate.md for the mount snippets
// and the WebSocket-binding precedence (`ws.port` / `server` / `ws.sidecar` /
// host-attached `hub.attach(server)`).
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'

// A plugin's default export is its `create<X>Devframe` factory — call it to
// get an instance (optionally with options). Swap these for your own.
import createInspectDevframe from '@devframes/plugin-inspect'
import createTerminalsDevframe from '@devframes/plugin-terminals'

export const hub = initHub({
  // Required — the conventional `/__devframes/`. The instance echoes the
  // normalized value back as `hub.base`; reference that, not the literal.
  base: DEVFRAMES_HUB_BASE,

  devframes: [
    createInspectDevframe(),
    createTerminalsDevframe(),
  ],

  // The reference viewer + a floating dock injected via one
  // `<script type="module" src="/__devframes/embedded.js">` tag.
  // Pass `ui: false` for a headless hub you drive with your own UI over the
  // shared-state protocol (see @devframes/hub/client).
  ui: createUi(),

  // Runs against the shared hub context — register cross-tool commands,
  // docks, message handlers here.
  configure(ctx) {
    ctx.commands.register({
      id: 'app:hello',
      title: 'Hello',
      handler: () => 'hi',
    })
  },
})

// hub.handler       — the whole devtools ecosystem as Request -> Response
// hub.nodeMiddleware — Connect-style middleware
// hub.attach(server) — hand the hub a node server's upgrade events
// hub.close()        — tear the transport down
