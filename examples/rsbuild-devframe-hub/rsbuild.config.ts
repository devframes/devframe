import type { RsbuildPlugin } from '@rsbuild/core'
import { mountDevframe } from '@devframes/hub/node'
import { toJsonRenderDockEntry } from '@devframes/json-render/hub'
import a11yDevframe, { a11yAgentBundlePath } from '@devframes/plugin-a11y'
import assetsDevframe from '@devframes/plugin-assets'
import codeServerDevframe from '@devframes/plugin-code-server'
import dataInspectorDevframe from '@devframes/plugin-data-inspector'
import { registerDataSource } from '@devframes/plugin-data-inspector/registry'
import gitDevframe from '@devframes/plugin-git'
import inspectDevframe from '@devframes/plugin-inspect'
import messagesDevframe from '@devframes/plugin-messages'
import ogDevframe from '@devframes/plugin-og'
import terminalsDevframe from '@devframes/plugin-terminals'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { createDashboardView } from 'json-render/dashboard'
import { basename, dirname } from 'pathe'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import demoDevframeB from './src/devframe-b'
import { rsbuildDevframeHub } from './src/rsbuild-devframe-hub'
import tabbedToolDevframe from './src/tabbed-tool'

// The host registers the live Rsbuild dev server as a data-inspector source —
// the registry is process-global, so this works from any plugin hook. Mirrors
// the Vite host's `vite:server` source.
function dataSources(): RsbuildPlugin {
  return {
    name: 'rsbuild-devframe-hub:data-sources',
    setup(api) {
      api.onBeforeStartDevServer(({ server }) => {
        registerDataSource({
          id: 'rsbuild:server',
          title: 'Rsbuild Dev Server',
          description: 'The live RsbuildDevServer + normalized config serving this hub.',
          icon: 'i-ph:lightning-duotone',
          data: () => ({ port: server.port, config: api.getNormalizedConfig() }),
          queries: [
            { title: 'Dev server port', query: 'port' },
            { title: 'Environment names', query: 'config.environments' },
            {
              title: 'Resolved config (clean)',
              query: 'config',
              excludeFunctions: true,
              excludeUnderscoreProps: true,
            },
          ],
        })
      })
    },
  }
}

export default defineConfig({
  resolve: { alias },
  source: {
    entry: { index: './src/client/index.tsx' },
  },
  html: {
    template: './src/client/index.html',
  },
  plugins: [
    pluginReact(),
    dataSources(),
    rsbuildDevframeHub({
      devframes: [
        demoDevframe,
        demoDevframeB,
        // Every built-in plugin, dogfooded end-to-end through the hub mount
        // path — the same set a full viewer like vite-devtools would surface.
        gitDevframe,
        terminalsDevframe,
        codeServerDevframe,
        inspectDevframe,
        dataInspectorDevframe,
        a11yDevframe,
        messagesDevframe,
        ogDevframe,
        assetsDevframe,
      ],
      // Attach the a11y inspector's in-page agent as its dock's client script.
      // The hub client runtime (booted in src/client/index.tsx) imports it into
      // this page so the docked panel scans the host live — no bespoke injection
      // plugin needed. Rsbuild has no Vite `/@fs/`, so the host serves the built
      // agent module same-origin from its own directory (see the host's
      // `mountStatic`), and points the client script at that URL.
      clientScripts: {
        [a11yDevframe.id]: { importFrom: `/__rsbuild-a11y-agent/${basename(a11yAgentBundlePath)}` },
      },
      // Dogfood the opt-in JSON-render hub integration: author a view on the
      // hub context and project it onto a `json-render` dock. The client host
      // (src/client/index.tsx) renders it with a mini React registry shared with
      // the Next hub example.
      onContextReady: async (context) => {
        // Serve the a11y agent module same-origin so the client script above
        // resolves. `mountStatic` is the same host seam the mounted SPAs use.
        context.host.mountStatic('/__rsbuild-a11y-agent/', dirname(a11yAgentBundlePath))

        const view = createDashboardView(context)
        context.docks.register(toJsonRenderDockEntry(view, {
          id: 'example:json-render',
          title: 'JSON Render',
          icon: 'ph:layout-duotone',
          category: 'app',
        }))

        // Shared-iframe soft-navigation demo. mountDevframe serves the SPA and
        // registers its iframe dock; the `dock` override marks it a `subTabs`
        // anchor (a shared `frameId` + the postmessage protocol) so the client
        // host attaches the frame-nav adapter, materializing one client-only
        // dock per tab the SPA's shim reports — all sharing this one iframe.
        await mountDevframe(context, tabbedToolDevframe, {
          dock: {
            category: 'app',
            frameId: 'rsbuild-tabbed-tool',
            subTabs: { protocol: 'postmessage' },
          },
        })
      },
    }),
  ],
})
