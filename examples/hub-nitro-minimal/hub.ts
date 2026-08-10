import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'

// The whole devtools installation in one call: two plugins mounted under
// /__devframes/, the reference UI filling the hub's ui slot (the standalone
// viewer at the namespace root + the floating dock at embedded.js), and the
// RPC socket on an eager side-car port advertised via __connection.json —
// Nitro's route handlers never deal with WebSocket upgrades.
//
// `key` memoizes the instance on globalThis, so Nitro's dev-time module
// reloads return the live hub instead of leaking side-car servers.
export const hub = initHub({
  key: 'hub-nitro-minimal',
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
      id: 'example:hub-nitro-minimal:ping',
      title: 'Nitro Hub · Ping',
      icon: 'ph:bell-duotone',
      category: 'kit',
      handler: () => 'pong',
    })
  },
})
