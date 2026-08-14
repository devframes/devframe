import type { createUi as CreateUi } from '@devframes/hub-ui'
import type { HubInstance } from '@devframes/hub/initiate'
import type { DevframeJsonRenderSpec } from '@devframes/json-render'
import type { jsonRenderUiRenderer as JsonRenderUiRenderer } from '@devframes/json-render-ui/hub'
import type { DevframeJsonRenderDockEntry } from '@devframes/json-render/hub'
import type { DevframeDefinition } from 'devframe'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'

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

// The plugin packages and `@devframes/hub-ui` resolve their prebuilt `dist`
// (SPA assets, the embedded/viewer bundles) via `new URL('../dist/...',
// import.meta.url)`. Loaded with a runtime dynamic `import()` carrying
// `webpackIgnore` / `turbopackIgnore` so Next's bundler leaves them alone and
// Node resolves the published `dist` at request time - a static import would
// be bundled from source and break those lookups.
//
// The default-export plugins load from a list of specifier *variables* (not
// string literals), so Next's bundler and TypeScript alike treat them as
// opaque — the plugins' node-side source (child processes, the native
// `zigpty` PTY backend) never gets pulled into this app's build or type
// program. `data-inspector` (a `:`-carrying default id) and `assets` (its
// watcher) need constructor options, so they load through dedicated helpers.
const BUILTIN_PLUGIN_PACKAGES = [
  '@devframes/plugin-git',
  '@devframes/plugin-terminals',
  '@devframes/plugin-code-server',
  '@devframes/plugin-inspect',
  '@devframes/plugin-a11y',
  '@devframes/plugin-messages',
  '@devframes/plugin-og',
] as const

async function loadHub(): Promise<HubInstance> {
  const [hubUi, jsonRenderUi, dataInspector, assets, ...builtins] = await Promise.all([
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/hub-ui'),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/json-render-ui/hub'),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/plugin-data-inspector'),
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@devframes/plugin-assets'),
    ...BUILTIN_PLUGIN_PACKAGES.map(
      pkg => import(/* webpackIgnore: true */ /* turbopackIgnore: true */ pkg),
    ),
  ])
  // Every built-in plugin, dogfooded end to end through the hub mount path.
  // `data-inspector`'s default id carries `:` (a route-param marker), so it
  // gets a colon-free id override to be a valid `<base><id>/` segment; the
  // assets watcher is off since this host demonstrates mounting, not authoring.
  const devframes: DevframeDefinition[] = [
    ...builtins.map(mod => mod.default as DevframeDefinition),
    (dataInspector.createDataInspectorDevframe as (options: { id: string }) => DevframeDefinition)({ id: 'devframes_plugin_data-inspector' }),
    (assets.createAssetsDevframe as (options: { watch: boolean }) => DevframeDefinition)({ watch: false }),
  ]
  // Next route handlers can't accept WebSocket upgrades, so the socket asks
  // for a side-car server of its own, advertised via `__connection.json`.
  return initHub({
    base: DEVFRAMES_HUB_BASE,
    ws: { sidecar: true },
    devframes,
    // Rebrand the reference UI to Next.js/Vercel's monochrome black — one
    // field, no CSS: `createUi`'s `branding` option publishes
    // `branding.json`, which the dock fetches at boot and feeds into
    // `--devframe-primary` (see `@devframes/hub-ui`'s `primary-ramp.css`).
    ui: (hubUi.createUi as typeof CreateUi)({ branding: { primaryColor: '#000000', productName: 'Devframes on Next.js' } }),
    // Serve the reference json-render frontend as a prebuilt renderer module
    // — the one-liner that makes `'json-render'` docks render in the prebuilt
    // viewer. Swap it for any community implementation of the same contract.
    renderers: [(jsonRenderUi.jsonRenderUiRenderer as typeof JsonRenderUiRenderer)()],
    configure(ctx) {
      ctx.docks.register(jsonRenderDock)
    },
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
