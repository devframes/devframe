/**
 * PROTOTYPE — throwaway code. STAGE 2 host.
 *
 * A minimal Vite host wiring the data-viewer prototype end to end:
 * devframe context + WS side-car (like examples/minimal-vite-devframe-hub),
 * the live ViteDevServer registered as a queryable data source — the exact
 * "inspect the Vite server instance" scenario the plugin idea came from.
 */
import type { DevframeHost } from 'devframe/types'
import type { Plugin, ViteDevServer } from 'vite'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { createHostContext, startHttpAndWs } from 'devframe/node'
import { getPort } from 'get-port-please'
import { defineConfig } from 'vite'
import { createDemoGraph } from './src/demo-data'
import { registerDataSource } from './src/registry'
import { allRpcFunctions } from './src/rpc-functions'

function dataViewerProtoHost(): Plugin {
  let started: { close: () => Promise<void> } | undefined

  return {
    name: 'prototype-data-viewer-host',
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
            ? join(cwd, 'node_modules/.prototype-data-viewer')
            : join(homedir(), '.prototype-data-viewer')
        },
      }

      const context = await createHostContext({ cwd, mode: 'dev', host })

      // The whole point: the live ViteDevServer, registered as a data source.
      registerDataSource(context, {
        id: 'vite:server',
        label: 'Vite Dev Server (live)',
        description: 'The ViteDevServer instance serving this very page.',
        examples: [
          'ownKeys()',
          'config.plugins.name',
          'moduleGraph.idToModuleMap.mapEntries().key',
          'environments.keys()',
          'config.resolve',
        ],
        getObject: () => server,
      })

      const demo = createDemoGraph()
      registerDataSource(context, {
        id: 'demo:kitchen-sink',
        label: 'Kitchen-sink demo object',
        description: 'Maps, Sets, circular refs, class instances, BigInt, functions.',
        examples: [
          'ownKeys()',
          'store.entries.mapEntries()',
          'tags.fromSet()',
          'circular',
          'bigArray[0:5]',
        ],
        getObject: () => demo,
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
  plugins: [dataViewerProtoHost()],
})
