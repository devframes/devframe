import type { Server } from 'node:http'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import createInspectDevframe from '@devframes/plugin-inspect'
import vue from '@vitejs/plugin-vue'
import { initDevframe } from 'devframe/initiate'
import { resolveBasePath } from 'devframe/node/hub-internals'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../alias'

/**
 * The inspector definition leaves `basePath` unset so it mounts at `/`
 * standalone; the dev bridge is a hosted context, so it resolves the hosted
 * mount path `/__<id>/` to sit alongside Vite on one origin.
 */
const hostedBase = resolveBasePath(createInspectDevframe(), 'hosted')

/**
 * Serve-only plugin that bridges the inspect node side (RPC + WebSocket +
 * `__connection.json`) onto Vite's own dev server under the hosted base
 * path, mounted as a **post** middleware so Vite serves the HMR SPA first and
 * the devframe host only answers the routes it owns. Inert during `vite build`.
 */
function inspectDevBridge(): Plugin {
  const devframe = createInspectDevframe()
  return {
    name: 'inspect-dev-bridge',
    apply: 'serve',
    configureServer(server) {
      const instance = initDevframe(devframe, {
        base: hostedBase,
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
 * `/__devframes_plugin_inspect/` (mounted in a hub). `connectDevframe`
 * resolves its connection meta relative to `document.baseURI` to match.
 *
 * In `vite dev` the panel is served under the hosted base path so its
 * `document.baseURI` matches production, and {@link inspectDevBridge} bridges
 * the node side there with HMR.
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? hostedBase : './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [vue(), UnoCSS(), inspectDevBridge()],
  /**
   * `@antfu/design` ships raw `.ts`/`.vue`; let `@vitejs/plugin-vue` compile its
   * SFCs instead of esbuild pre-bundling them.
   */
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    outDir: fileURLToPath(new URL('../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
}))
