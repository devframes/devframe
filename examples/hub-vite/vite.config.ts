import type { DevframeHubContext } from '@devframes/hub/node'
import { defineHubRpcFunction } from '@devframes/hub'
import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'
import { toJsonRenderDockEntry } from '@devframes/json-render/hub'
import createA11yDevframe, { a11yAgentBundlePath } from '@devframes/plugin-a11y'
import createAssetsDevframe from '@devframes/plugin-assets'
import createCodeServerDevframe from '@devframes/plugin-code-server'
import { createDataInspectorDevframe } from '@devframes/plugin-data-inspector'
import { registerDataSource } from '@devframes/plugin-data-inspector/registry'
import createGitDevframe from '@devframes/plugin-git'
import createInspectDevframe from '@devframes/plugin-inspect'
import createMessagesDevframe from '@devframes/plugin-messages'
import createOgDevframe from '@devframes/plugin-og'
import createTerminalsDevframe from '@devframes/plugin-terminals'
import { viteDevframeHub } from '@devframes/vite/hub'
import { createDashboardView } from 'json-render/dashboard'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import tabbedToolDevframe from './src/tabbed-tool'
import { unrenderedDockEntry } from './src/unrendered-dock'

const a11yDevframe = createA11yDevframe()
const assetsDevframe = createAssetsDevframe()
const codeServerDevframe = createCodeServerDevframe()
const gitDevframe = createGitDevframe()
const inspectDevframe = createInspectDevframe()
const messagesDevframe = createMessagesDevframe()
const ogDevframe = createOgDevframe()
const terminalsDevframe = createTerminalsDevframe()
// Colon-free id override: the hub instance derives each frame's mount path
// (`/__devframes/<id>/`) from its id, and `:` - which the plugin's default id
// (`devframes:plugin:data-inspector`) carries - is a route-param marker to
// the router underneath.
const dataInspectorDevframe = createDataInspectorDevframe({ id: 'devframes_plugin_data-inspector' })

// Minimal hub-local RPCs the vanilla client reads for its message / terminal
// lists. A more ambitious host would standardise these (alongside the
// built-in `hub:commands:execute`); the reference keeps them example-local and
// hands them to `viteDevframeHub` via `rpcDeclarations`.
const messagesList = defineHubRpcFunction({
  name: 'example:vite-devframe-hub:messages:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
    async handler() {
      return Array.from(ctx.messages.entries.values())
    },
  }),
})

const terminalsList = defineHubRpcFunction({
  name: 'example:vite-devframe-hub:terminals:list',
  type: 'static',
  jsonSerializable: true,
  setup: (ctx: DevframeHubContext) => ({
    async handler() {
      return Array.from(ctx.terminals.sessions.values()).map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        status: s.status,
      }))
    },
  }),
})

export default defineConfig({
  resolve: { alias },
  // Dev tooling reached from arbitrary hostnames (LAN IPs, tunnels, tailnets):
  // accept any Host header and fall back to the next free port when busy.
  server: { allowedHosts: true, strictPort: false },
  plugins: [
    UnoCSS(),
    {
      // The host registers its own live objects as data-inspector sources -
      // the registry is process-global, so this works from any plugin hook.
      name: 'vite-devframe-hub:data-sources',
      configureServer(server) {
        registerDataSource({
          id: 'vite:server',
          title: 'Vite Dev Server',
          description: 'The live ViteDevServer instance serving this hub.',
          icon: 'i-ph:lightning-duotone',
          data: () => server,
          queries: [
            { title: 'Plugin names', query: 'config.plugins.name' },
            {
              title: 'Module graph',
              description: 'Client-environment modules with their importers',
              query: 'environments.client.moduleGraph.idToModuleMap.mapEntries().value.({ url, type, importers: importers.fromSet().url })',
            },
            {
              title: 'Resolved config (clean)',
              query: 'config',
              excludeFunctions: true,
              excludeUnderscoreProps: true,
            },
          ],
        })
      },
    },
    // The whole Vite host: `@devframes/vite/hub` wraps `initHub` and mounts it
    // as connect middleware. This host renders its own vanilla client
    // (src/client/main.ts) against `@devframes/hub/client`, so it opts out of
    // the default `@devframes/hub-ui` slot with `ui: false`. `quiet` silences
    // the Vite-DevTools recommendation for this reference example.
    viteDevframeHub({
      ui: false,
      quiet: true,
      register: {
        id: 'example:vite-devframe-hub',
        name: 'Vite Devframe Hub',
      },
      rpcDeclarations: [messagesList, terminalsList],
      devframes: [
        demoDevframe,
        // Every built-in plugin, dogfooded end-to-end through the hub mount
        // path - the same set a full viewer like vite-devtools would surface.
        gitDevframe,
        terminalsDevframe,
        codeServerDevframe,
        inspectDevframe,
        dataInspectorDevframe,
        a11yDevframe,
        messagesDevframe,
        ogDevframe,
        assetsDevframe,
        // Shared-iframe soft-navigation demo. The hub instance serves the SPA
        // and registers its iframe dock; the `dock` override marks it a
        // `subTabs` anchor (a shared `frameId` + the postmessage protocol) so
        // the client host attaches the frame-nav adapter, materializing one
        // client-only dock per tab the SPA's shim reports - all sharing this
        // one iframe.
        {
          devframe: tabbedToolDevframe,
          dock: {
            category: 'app',
            frameId: 'tabbed-tool',
            subTabs: { protocol: 'postmessage' },
          },
        },
      ],
      // Attach the a11y inspector's in-page agent as its dock's client script.
      // The hub client runtime (booted in src/client/main.ts) imports it into
      // this page so the docked panel scans the host live - no bespoke
      // injection plugin needed. `/@fs/` lets Vite serve the built module.
      clientScripts: {
        [a11yDevframe.id]: { importFrom: `/@fs/${a11yAgentBundlePath}` },
      },
      // Serve the reference json-render frontend as a prebuilt renderer
      // module: the hub publishes it in the renderer manifest and the client
      // (src/client/main.ts) imports it lazily the first time a
      // `json-render` dock mounts — no Vue and no renderer code compiled
      // into this host's own bundle.
      renderers: [jsonRenderUiRenderer()],
      configure: async (context) => {
        // Seed a sample command directly on the hub so the UI shows something
        // even without any plugged-in devframes.
        context.commands.register({
          id: 'example:vite-devframe-hub:ping',
          title: 'Vite Hub · Ping',
          icon: 'ph:bell-duotone',
          category: 'kit',
          handler: () => 'pong',
        })

        // Dogfood the opt-in JSON-render hub integration: author a view on the
        // hub context and project it onto a `json-render` dock, rendered by the
        // manifest module above.
        const view = createDashboardView(context)
        context.docks.register(toJsonRenderDockEntry(view, {
          id: 'example:json-render',
          title: 'JSON Render',
          icon: 'ph:layout-duotone',
          category: 'app',
        }))
        // Bare-specifier client script demo: `importFrom` names the npm
        // package itself. The Vite host advertises its default
        // `clientModuleResolution` (`'/@id/{specifier}'`), so the client host
        // imports the script through Vite's own module graph — its bare
        // `nanoevents` import resolves there too. The Next reference host
        // consumes the same package as a prebuilt self-contained bundle
        // instead (see examples/demo-dock-client).
        context.docks.register({
          type: 'action',
          id: 'example:demo-client-script',
          title: 'Client Script Demo',
          icon: 'ph:plugs-connected-duotone',
          category: 'app',
          action: { importFrom: 'demo-dock-client' },
        })

        // Witness the missing-renderer path: a dock type nothing covers —
        // the client shows its fallback view instead of a dead panel.
        context.docks.register(unrenderedDockEntry)

        await context.messages.add({
          level: 'success',
          message: 'Vite Devframe Hub started',
          description: 'Mounted under /__devframes/ with the built-in plugins.',
        })
      },
    }),
  ],
})
