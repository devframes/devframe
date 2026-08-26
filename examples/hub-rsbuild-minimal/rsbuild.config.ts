import type { HubInstance } from '@devframes/hub/initiate'
import type { DevframeJsonRenderSpec } from '@devframes/json-render'
import type { DevframeJsonRenderDockEntry } from '@devframes/json-render/hub'
import { createUi } from '@devframes/hub-ui'
import { DEVFRAMES_HUB_BASE, initHub } from '@devframes/hub/initiate'
import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'
import { createA11yDevframe } from '@devframes/plugin-a11y'
import { createAssetsDevframe } from '@devframes/plugin-assets'
import { createCodeServerDevframe } from '@devframes/plugin-code-server'
import { createDataInspectorDevframe } from '@devframes/plugin-data-inspector'
import { createGitDevframe } from '@devframes/plugin-git'
import { createInspectDevframe } from '@devframes/plugin-inspect'
import { createMessagesDevframe } from '@devframes/plugin-messages'
import { createOgDevframe } from '@devframes/plugin-og'
import { createTerminalsDevframe } from '@devframes/plugin-terminals'
import { defineConfig } from '@rsbuild/core'

// Every built-in plugin, dogfooded end to end through the hub mount path.
// `data-inspector`'s default id carries `:` (a route-param marker), so it
// gets a colon-free id override to be a valid `<base><id>/` segment; the
// assets watcher is off since this host demonstrates mounting, not authoring.
const builtinDevframes = [
  createGitDevframe(),
  createTerminalsDevframe(),
  createCodeServerDevframe(),
  createInspectDevframe(),
  createDataInspectorDevframe({ id: 'devframes_plugin_data-inspector' }),
  createA11yDevframe(),
  createMessagesDevframe(),
  createOgDevframe(),
  createAssetsDevframe({ watch: false }),
]

// The one mount base, referenced by both `initHub({ base })` and the injected
// embedded-script URL - no duplicated string literal.
const base = DEVFRAMES_HUB_BASE

// The minimal Rsbuild host: one `initHub()` call mounted into the dev
// server's middleware stack. It's created lazily inside `server.setup` (not
// at module scope) so merely importing this config never spawns the hub's
// side-car server, and the `??=` keeps a re-run reusing the live one -
// config readers (Rsbuild, knip, tests) stay side-effect free. `initHub` runs
// here in Rsbuild's Node process, never bundled into the browser, so
// `createUi()`'s prebuilt assets and the plugins' node code work unchanged;
// the dock UI comes from `@devframes/hub-ui` via the `ui` slot.
let hub: HubInstance | undefined

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

export default defineConfig({
  source: { entry: { index: './src/index.ts' } },
  server: {
    // Runs before Rsbuild's built-in middlewares, so the hub owns
    // `/__devframes/*` and hands everything else back to Rsbuild via next().
    setup({ server }) {
      hub ??= initHub({
        base,
        devframes: builtinDevframes,
        // Rebrand the reference UI to Rsbuild's own orange — one field, no
        // CSS: `createUi`'s `branding` option publishes
        // `ConnectionMeta.configs.ui.branding`, which the dock reads at
        // connect time and feeds into `--devframe-primary` (see
        // `@devframes/hub-ui`'s `primary-ramp.css`).
        ui: createUi({ branding: { primaryColor: '#ff5e00', productName: 'Devframes on Rsbuild' } }),
        // Serve the reference json-render frontend as a prebuilt renderer
        // module — the one-liner that makes `'json-render'` docks render in
        // the prebuilt viewer. Swap it for any community implementation of
        // the same contract.
        renderers: [jsonRenderUiRenderer()],
        configure(ctx) {
          ctx.docks.register(jsonRenderDock)
        },
        // Gate with devframe's interactive OTP (the default). The hub prints a
        // 6-digit code + magic link on startup, and the reference UI's
        // authorization view exchanges it for a bearer token. See
        // docs/content/1.guide/15.security.md.
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
    // The floating-dock bootstrap - one dev-only module script, the whole
    // embedded integration.
    tags: [
      { tag: 'script', attrs: { type: 'module', src: `${base}embedded.js` }, append: true },
    ],
  },
})
