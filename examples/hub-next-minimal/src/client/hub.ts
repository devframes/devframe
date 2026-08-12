import type { createUi as CreateUi } from '@devframes/hub-ui'
import type { HubInstance } from '@devframes/hub/initiate'
import type { DevframeDefinition } from 'devframe'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'

// The plugin packages and `@devframes/hub-ui` resolve their prebuilt `dist`
// (SPA assets, the embedded/viewer bundles) via `new URL('../dist/...',
// import.meta.url)`. Loaded with a runtime dynamic `import()` carrying
// `webpackIgnore` / `turbopackIgnore` so Next's bundler leaves them alone and
// Node resolves the published `dist` at request time — a static import would
// be bundled from source and break those lookups.
async function loadHub(): Promise<HubInstance> {
  const [hubUi, inspect, messages] = await Promise.all([
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/hub-ui'),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/plugin-inspect'),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/plugin-messages'),
  ])
  const devframes: DevframeDefinition[] = [
    (inspect.createInspectDevframe as () => DevframeDefinition)(),
    (messages.createMessagesDevframe as () => DevframeDefinition)(),
  ]
  // Next route handlers can't accept WebSocket upgrades, so the socket asks
  // for a side-car server of its own, advertised via `__connection.json`.
  return initHub({
    base: DEVFRAMES_HUB_BASE,
    ws: { sidecar: true },
    devframes,
    ui: (hubUi.createUi as typeof CreateUi)(),
    // Single-user localhost demo: opts out of the gate. A hub reachable
    // beyond localhost should gate (see docs/guide/security.md).
    auth: false,
  })
}

// The route-facing singleton, memoized on globalThis: Next re-evaluates route
// modules across dev-time reloads, and without the memo each reload would
// start another side-car and leak the previous one. It also keeps the dynamic
// plugin loading from re-running per request.
const globalRef = globalThis as { __hubNextMinimal?: Promise<HubInstance> }

export function ensureHub(): Promise<HubInstance> {
  globalRef.__hubNextMinimal ??= loadHub()
  return globalRef.__hubNextMinimal
}
