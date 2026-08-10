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
  // `key` memoizes the instance on globalThis across Next's dev-time module
  // re-evaluations. Next route handlers can't accept WebSocket upgrades, so
  // the instance starts its default eager side-car WS server, advertised via
  // `__connection.json`.
  return initHub({
    key: 'hub-next-minimal',
    base: DEVFRAMES_HUB_BASE,
    devframes,
    ui: (hubUi.createUi as typeof CreateUi)(),
    // Single-user localhost demo: opts out of the gate. A hub reachable
    // beyond localhost should gate (see docs/guide/security.md).
    auth: false,
  })
}

let hubPromise: Promise<HubInstance> | undefined

// The route-facing singleton. `initHub`'s `key` memoizes the live instance on
// globalThis across dev reloads; this promise avoids re-running the dynamic
// plugin loading per request.
export function ensureHub(): Promise<HubInstance> {
  hubPromise ??= loadHub()
  return hubPromise
}
