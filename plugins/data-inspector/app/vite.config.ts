import type { Server } from 'node:http'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import createDataInspectorDevframe from '@devframes/plugin-data-inspector'
import vue from '@vitejs/plugin-vue'
import { initDevframe } from 'devframe/initiate'
import { resolveBasePath } from 'devframe/internal'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../alias'

const devframe = createDataInspectorDevframe()
// Hosted base (`/__devframes_plugin_data_inspector/`): the SPA and the dev
// bridge share it so `document.baseURI` matches production while Vite serves
// the HMR panel.
const basePath = resolveBasePath(devframe, 'hosted')

/**
 * Serve-only plugin that bridges the data-inspector node side (RPC + WebSocket
 * + `__connection.json`) onto Vite's own dev server under the devframe base
 * path, mounted as a **post** middleware so Vite serves the HMR SPA first and
 * the devframe host only answers the routes it owns. Inert during `vite build`.
 */
function dataInspectorDevBridge(): Plugin {
  return {
    name: 'data-inspector-dev-bridge',
    apply: 'serve',
    configureServer(server) {
      const instance = initDevframe(devframe, {
        base: basePath,
        distDir: false,
        server: server.httpServer as Server,
        auth: false,
      })
      return () => server.middlewares.use(instance.nodeMiddleware)
    },
  }
}

/**
 * `base: './'` for the build keeps the mount path portable: the same `app`
 * output works whether devframe serves it at `/` (standalone) or
 * `/__devframes_plugin_data_inspector/` (mounted in a hub). `connectDevframe`
 * resolves its connection meta relative to `document.baseURI` to match.
 *
 * In `vite dev` the panel is served under the devframe base path so its
 * `document.baseURI` matches production, and {@link dataInspectorDevBridge}
 * bridges the node side there with HMR.
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? basePath : './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  /**
   * discovery (or a dep) references the Node-style `global`; webpack shims it
   * by default, Vite needs the classic define.
   */
  define: { global: 'globalThis' },
  plugins: [vue(), UnoCSS(), dataInspectorDevBridge()],
  /**
   * `@antfu/design` ships raw `.ts`/`.vue`; let `@vitejs/plugin-vue` compile
   * its SFCs instead of esbuild pre-bundling them.
   */
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    outDir: fileURLToPath(new URL('../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
}))
