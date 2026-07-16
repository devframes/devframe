/**
 * PROTOTYPE — throwaway code. STAGE 2 host.
 *
 * A minimal Vite host wiring the data-inspector prototype end to end:
 * devframe context + WS side-car (like examples/minimal-vite-devframe-hub),
 * with the live ViteDevServer registered as a queryable data source — the
 * exact "inspect the Vite server instance" scenario the plugin idea came from.
 */
import type { DevframeHost } from 'devframe/types'
import type { Plugin, ViteDevServer } from 'vite'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { createHostContext, startHttpAndWs } from 'devframe/node'
import { getPort } from 'get-port-please'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { createDemoGraph } from './src/demo-data'
import { registerDataSource } from './src/registry'
import { allRpcFunctions } from './src/rpc-functions'

function dataInspectorHost(): Plugin {
  let started: { close: () => Promise<void> } | undefined

  return {
    name: 'prototype-data-inspector-host',
    apply: 'serve',
    async configureServer(server: ViteDevServer) {
      await started?.close().catch(() => {})
      started = undefined

      const cwd = server.config.root
      const port = await getPort({ port: 9878, portRange: [9878, 9978] })

      const host: DevframeHost = {
        mountStatic() {},
        mountConnectionMeta() {},
        resolveOrigin() {
          const resolved = server.resolvedUrls?.local?.[0]
          return resolved ? new URL(resolved).origin : 'http://localhost:5173'
        },
        getStorageDir(scope) {
          return scope === 'workspace'
            ? join(cwd, 'node_modules/.data-inspector')
            : join(homedir(), '.data-inspector')
        },
      }

      const context = await createHostContext({ cwd, mode: 'dev', host })

      // The whole point: the live ViteDevServer, registered as a data source.
      registerDataSource(context, {
        id: 'vite:server',
        title: 'Vite Dev Server',
        description: 'The live ViteDevServer instance serving this very page.',
        getData: () => server,
        queries: [
          {
            title: 'Plugin names',
            description: 'Every plugin in resolution order',
            query: 'config.plugins.name',
          },
          {
            title: 'Module graph',
            description: 'Modules of the client environment with their importers',
            query: 'environments.client.moduleGraph.idToModuleMap.mapEntries().value.({ url, type, importers: importers.fromSet().url })',
          },
          {
            title: 'Resolved config (clean)',
            description: 'The config without functions and internals',
            query: 'config',
            excludeFunctions: true,
            excludeUnderscoreProps: true,
          },
          {
            title: 'Server capabilities',
            query: 'ownKeys()',
          },
        ],
      })

      const demo = createDemoGraph()
      registerDataSource(context, {
        id: 'demo:kitchen-sink',
        title: 'Kitchen-sink demo',
        description: 'Maps, Sets, circular refs, class instances, BigInt, functions.',
        getData: () => demo,
        queries: [
          { title: 'Session store entries', query: 'store.entries.mapEntries()' },
          { title: 'Circular structure', query: 'circular' },
          { title: 'Data only', description: 'The whole graph without functions', query: '', excludeFunctions: true },
        ],
      })

      // `static: true` demo — getData runs once and is memoized, so
      // `generatedAt` stays constant across queries.
      registerDataSource(context, {
        id: 'meta:process',
        title: 'Process snapshot',
        description: 'Static snapshot of the dev process, taken at first query.',
        static: true,
        getData: () => ({
          generatedAt: new Date().toISOString(),
          node: process.version,
          pid: process.pid,
          platform: process.platform,
          cwd,
          env: { NODE_ENV: process.env.NODE_ENV ?? null },
        }),
      })

      for (const fn of allRpcFunctions)
        context.rpc.register(fn)

      started = await startHttpAndWs({ context, port, auth: false })

      // Let the SPA discover the WS endpoint via ./__connection.json
      server.middlewares.use(`/${DEVFRAME_CONNECTION_META_FILENAME}`, (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ backend: 'websocket', websocket: port }))
      })

      server.httpServer?.once('close', () => {
        void started?.close().catch(() => {})
      })
    },
    async closeBundle() {
      await started?.close().catch(() => {})
      started = undefined
    },
  }
}

export default defineConfig({
  // discovery (or a dep) references the Node-style `global`; webpack shims
  // it by default, Vite needs the classic define. FINDING for the real plugin.
  define: { global: 'globalThis' },
  plugins: [
    vue(),
    UnoCSS(),
    dataInspectorHost(),
  ],
  // `@antfu/design` ships raw `.ts`/`.vue`; let `@vitejs/plugin-vue` compile
  // its SFCs instead of esbuild pre-bundling them.
  optimizeDeps: { exclude: ['@antfu/design'] },
})
