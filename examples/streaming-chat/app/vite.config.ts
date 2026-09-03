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
 * Serve-only plugin that bridges the streaming-chat node side (RPC +
 * WebSocket + `__connection.json`) onto Vite's dev server under the devframe
 * base path, mounted as a post middleware so Vite serves the HMR SPA first and
 * the devframe host only answers the routes it owns. Inert during `vite build`.
 */
function streamingChatDevBridge(): Plugin {
  return {
    name: 'streaming-chat-dev-bridge',
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
 * output works whether devframe serves it at `/` (standalone) or the devframe
 * base path (mounted in a hub). `connectDevframe` resolves its connection meta
 * relative to `document.baseURI` to match.
 *
 * In `vite dev` the panel is served under the devframe base path so its
 * `document.baseURI` matches production, and {@link streamingChatDevBridge}
 * bridges the node side there with HMR.
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? resolveBasePath(devframe, 'hosted') : './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [UnoCSS(), preact(), streamingChatDevBridge()],
  build: {
    outDir: fileURLToPath(new URL('../dist/client', import.meta.url)),
    emptyOutDir: true,
  },
}))
