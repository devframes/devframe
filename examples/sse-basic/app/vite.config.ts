import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import { initDevframe } from 'devframe/initiate'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../alias'
import devframe from '../src/node/index.ts'

const BASE = '/__sse-basic/'

/**
 * Serve-only plugin that bridges the SSE-only node side (`__connection.json` +
 * the `<base>__sse` RPC stream, no WebSocket) onto Vite's dev server. Only the
 * devframe-owned `<base>__*` routes go to the instance; every other request
 * (the SPA at the base, its HMR assets) falls through to Vite. `distDir: false`
 * keeps the instance in bridge mode. Inert during `vite build`.
 */
function sseBridge(): Plugin {
  return {
    name: 'sse-basic-dev-bridge',
    apply: 'serve',
    configureServer(server) {
      const instance = initDevframe(devframe, {
        base: BASE,
        ws: false,
        distDir: false,
        /**
         * Single-user localhost demo; a server reachable beyond localhost
         * should gate (see docs/content/1.guide/13.security.md).
         */
        auth: false,
      })
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname
        if (path.startsWith(`${BASE}__`))
          instance.nodeMiddleware(req, res, next)
        else next()
      })
      server.httpServer?.once('close', () => {
        void instance.close().catch(() => {})
      })
    },
  }
}

/**
 * `base: './'` for the build keeps the mount path portable: the same `app`
 * output works whether devframe serves it at `/` (standalone) or
 * `/__sse-basic/` (mounted in a host). In `vite dev` the SPA is served under
 * the devframe base path so its `document.baseURI` matches production, and
 * {@link sseBridge} bridges the node side there with HMR.
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? BASE : './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  server: { allowedHosts: true, strictPort: false },
  plugins: [UnoCSS(), sseBridge()],
  build: {
    outDir: fileURLToPath(new URL('../dist/client', import.meta.url)),
    emptyOutDir: true,
  },
}))
