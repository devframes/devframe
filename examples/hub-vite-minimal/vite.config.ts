import type { DevframeJsonRenderSpec } from '@devframes/json-render'
import type { DevframeJsonRenderDockEntry } from '@devframes/json-render/hub'
import { createUi } from '@devframes/hub-ui'
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
import { viteDevframeHub } from '@devframes/vite/hub'
import { defineConfig } from 'vite'

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

// A server-authored JSON-render dock: the whole view is this serializable
// spec - no client build. It renders through whatever `'json-render'`
// renderer the hub composes (below, the reference `@devframes/json-render-ui`
// module); without one, the hub UI provider shows its missing-renderer fallback.
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

/**
 * The minimal Vite host: one `viteDevframeHub()` plugin from
 * `@devframes/vite/hub`. It wraps `initHub` (mounted as connect middleware on
 * Vite's dev server, sharing its HTTP server for the WS upgrade at
 * `/__devframes/__ws`) and injects the UI's `embedded.js` bootstrap into the
 * host page - the whole embedded integration in one call. `quiet` silences the
 * Vite-DevTools recommendation for this reference example.
 */
export default defineConfig({
  /**
   * Dev tooling reached from arbitrary hostnames (LAN IPs, tunnels): accept
   * any Host header and fall back to the next free port when busy.
   */
  server: { allowedHosts: true, strictPort: false },
  plugins: [
    viteDevframeHub({
      quiet: true,
      devframes: builtinDevframes,
      /**
       * Rebrand the reference UI to Vite's own purple - one field, no CSS:
       * `createUi`'s `branding` option publishes `ConnectionMeta.configs.ui.branding`,
       * which the dock reads at connect time and feeds into `--devframe-primary`
       * (see `@devframes/hub-ui`'s `primary-ramp.css`). Passing `ui` overrides
       * the default `createUi()` the plugin would otherwise use.
       */
      ui: createUi({ branding: { primaryColor: '#646cff', productName: 'Devframes on Vite' } }),
      /**
       * Serve the reference json-render frontend as a prebuilt renderer
       * module - the one-liner that makes `'json-render'` docks render in
       * the prebuilt hub UI provider. Swap it for any community implementation of
       * the same contract.
       */
      renderers: [jsonRenderUiRenderer()],
      configure(ctx) {
        ctx.docks.register(jsonRenderDock)
      },
      // Gate with devframe's interactive OTP (the default): the hub prints a
      // 6-digit code + magic link on startup, and the reference UI's
      // authorization view exchanges it for a bearer token. See
      // docs/content/1.guide/13.security.md.
    }),
  ],
})
