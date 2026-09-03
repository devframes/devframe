import type { Server } from 'node:http'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import createA11yDevframe from '@devframes/plugin-a11y'
import { initDevframe } from 'devframe/initiate'
import { resolveBasePath } from 'devframe/internal'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { alias } from '../../../alias'

/**
 * Serve-only plugin that bridges the a11y node side (RPC + WebSocket +
 * `__connection.json`) onto Vite's own dev server under the devframe base
 * path, mounted as a **post** middleware so Vite serves the HMR SPA first and
 * the devframe host only answers the routes it owns. Inert during `vite build`.
 */
function a11yDevBridge(): Plugin {
  const devframe = createA11yDevframe()
  return {
    name: 'a11y-dev-bridge',
    apply: 'serve',
    configureServer(server) {
      const instance = initDevframe(devframe, {
        base: resolveBasePath(devframe, 'hosted'),
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
 * `/__devframes_plugin_a11y/` (mounted in a hub). `connectDevframe` resolves
 * its connection meta relative to `document.baseURI` to match.
 *
 * In `vite dev` the panel is served under the devframe base path so its
 * `document.baseURI` matches production, and {@link a11yDevBridge} bridges the
 * node side there with HMR.
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? resolveBasePath(createA11yDevframe(), 'hosted') : './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [solid(), UnoCSS(), a11yDevBridge()],
  build: {
    outDir: fileURLToPath(new URL('../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
}))
