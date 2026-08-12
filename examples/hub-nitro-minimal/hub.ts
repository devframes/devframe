import type { HubInstance } from '@devframes/hub/initiate'
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'

// The whole devtools installation in one call: two plugins mounted under
// /__devframes/, the reference UI filling the hub's ui slot (the standalone
// viewer at the namespace root + the floating dock at embedded.js), and the
// RPC socket on a side-car port advertised via __connection.json — Nitro's
// route handlers never deal with WebSocket upgrades, so `ws.sidecar` asks
// for a socket of its own.
//
// Memoized on globalThis: Nitro re-evaluates this module on a dev-time
// reload, and without the memo each reload would start another side-car and
// leak the previous one. Any host with module reloading wants this shape.
const globalRef = globalThis as { __hubNitroMinimal?: HubInstance }

export const hub: HubInstance = globalRef.__hubNitroMinimal ??= initHub({
  base: DEVFRAMES_HUB_BASE,
  ws: { sidecar: true },
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
      id: 'example:hub-nitro-minimal:ping',
      title: 'Nitro Hub · Ping',
      icon: 'ph:bell-duotone',
      category: 'kit',
      handler: () => 'pong',
    })
  },
})
