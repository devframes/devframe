import a11yDevframe, { a11yAgentBundlePath } from '@devframes/plugin-a11y'
import codeServerDevframe from '@devframes/plugin-code-server'
import dataInspectorDevframe from '@devframes/plugin-data-inspector'
import { registerDataSource } from '@devframes/plugin-data-inspector/registry'
import gitDevframe from '@devframes/plugin-git'
import inspectDevframe from '@devframes/plugin-inspect'
import messagesDevframe from '@devframes/plugin-messages'
import ogDevframe from '@devframes/plugin-og'
import terminalsDevframe from '@devframes/plugin-terminals'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../alias'
import demoDevframe from './src/devframe'
import demoDevframeB from './src/devframe-b'
import { minimalViteDevframeHub } from './src/minimal-vite-devframe-hub'

export default defineConfig({
  resolve: { alias },
  // Dev tooling reached from arbitrary hostnames (LAN IPs, tunnels, tailnets):
  // accept any Host header and fall back to the next free port when busy.
  server: { allowedHosts: true, strictPort: false },
  plugins: [
    UnoCSS(),
    {
      // The host registers its own live objects as data-inspector sources —
      // the registry is process-global, so this works from any plugin hook.
      name: 'minimal-vite-devframe-hub:data-sources',
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
    minimalViteDevframeHub({
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
      ],
      // Attach the a11y inspector's in-page agent as its dock's client script.
      // The hub client runtime (booted in src/client/main.ts) imports it into
      // this page so the docked panel scans the host live — no bespoke
      // injection plugin needed. `/@fs/` lets Vite serve the built module.
      clientScripts: {
        [a11yDevframe.id]: { importFrom: `/@fs/${a11yAgentBundlePath}` },
      },
    }),
  ],
})
