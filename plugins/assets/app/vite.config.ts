import type { Server } from 'node:http'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import createAssetsDevframe from '@devframes/plugin-assets'
import vue from '@vitejs/plugin-vue'
import { initDevframe } from 'devframe/initiate'
import { resolveBasePath } from 'devframe/internal'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../alias'

const devframe = createAssetsDevframe()
// Hosted base (`/__devframes_plugin_assets/`): the SPA and the dev bridge share
// it so `document.baseURI` matches production while Vite serves the HMR panel.
const basePath = resolveBasePath(devframe, 'hosted')

/**
 * Serve-only plugin that bridges the assets node side (RPC + WebSocket +
 * `__connection.json`) onto Vite's own dev server under the devframe base
 * path, mounted as a **post** middleware so Vite serves the HMR SPA first and
 * the devframe host only answers the routes it owns. Inert during `vite build`.
 */
function assetsDevBridge(): Plugin {
  return {
    name: 'assets-dev-bridge',
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
 * `/__devframes_plugin_assets/` (mounted in a hub). `connectDevframe` resolves
 * its connection meta relative to `document.baseURI` to match.
 *
 * In `vite dev` the panel is served under the devframe base path so its
 * `document.baseURI` matches production, and {@link assetsDevBridge} bridges the
 * node side there with HMR. The managed `public/` fixtures are served at `/`
 * (matching the default `baseURL`) in dev only, so they never land in dist.
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? basePath : './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: command === 'serve' ? fileURLToPath(new URL('../public', import.meta.url)) : false,
  resolve: { alias },
  plugins: [vue(), UnoCSS(), assetsDevBridge()],
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    outDir: fileURLToPath(new URL('../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
}))
