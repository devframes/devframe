import type { Server } from 'node:http'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import preact from '@preact/preset-vite'
import { initDevframe } from 'devframe/initiate'
import { resolveBasePath } from 'devframe/internal'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../alias'
import devframe from '../src/node/index.ts'

/**
 * Serve-only plugin that bridges the node side (RPC + WebSocket +
 * `__connection.json`) onto Vite's dev server under the devframe base path,
 * mounted as a post middleware so Vite serves the HMR SPA first and the
 * devframe host only answers the routes it owns. Inert during `vite build`.
 */
function filesInspectorDevBridge(): Plugin {
  return {
    name: 'files-inspector-dev-bridge',
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
 * `base: './'` for the build keeps the mount path portable: the same output
 * works whether devframe serves it at `/` (standalone) or under a base path
 * (mounted in a hub). In `vite dev` the panel is served under the devframe
 * base path so its `document.baseURI` matches production, and the dev bridge
 * bridges the node side there with HMR.
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? resolveBasePath(devframe, 'hosted') : './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [UnoCSS(), preact(), filesInspectorDevBridge()],
  build: {
    outDir: fileURLToPath(new URL('../dist/client', import.meta.url)),
    emptyOutDir: true,
  },
}))
