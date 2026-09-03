import type { Server } from 'node:http'
import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import createMessagesDevframe from '@devframes/plugin-messages'
import vue from '@vitejs/plugin-vue'
import { initDevframe } from 'devframe/initiate'
import { resolveBasePath } from 'devframe/internal'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../alias'
import { createMessagesDevDevframe } from './dev-host'

const devframe = createMessagesDevframe()
// Hosted base (`/__devframes_plugin_messages/`): the SPA and the dev bridge
// share it so `document.baseURI` matches production while Vite serves HMR.
const basePath = resolveBasePath(devframe, 'hosted')

/**
 * Serve-only plugin that bridges the messages node side (RPC + WebSocket +
 * `__connection.json`) onto Vite's own dev server under the devframe base
 * path, mounted as a **post** middleware so Vite serves the HMR SPA first and
 * the devframe host only answers the routes it owns. The demo-seeded dev
 * harness stands in for a hub messages host. Inert during `vite build`.
 */
function messagesDevBridge(): Plugin {
  return {
    name: 'messages-dev-bridge',
    apply: 'serve',
    configureServer(server) {
      const instance = initDevframe(createMessagesDevDevframe(), {
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
 * The messages panel SPA. `base: './'` for the build keeps the mount path
 * portable: the same output works whether devframe serves it at `/`
 * (standalone) or `/__devframes_plugin_messages/` (mounted in a hub).
 * `connectDevframe` resolves its connection meta relative to `document.baseURI`
 * to match.
 *
 * In `vite dev` the panel is served under the devframe base path so its
 * `document.baseURI` matches production, and {@link messagesDevBridge} bridges
 * the node side there with HMR.
 */
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? basePath : './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [vue(), UnoCSS(), messagesDevBridge()],
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
