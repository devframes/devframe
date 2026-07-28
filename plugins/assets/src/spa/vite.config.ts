import type { IncomingMessage, ServerResponse } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import preact from '@preact/preset-vite'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { resolve } from 'pathe'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'
import { assetsVitePlugin } from '../vite'

// Default managed directory + raw-serving base for the standalone dev
// server (matches `createAssetsDevframe()`'s defaults with the default id).
const RAW_BASE = '/__devframes_plugin_assets-raw/'
const PUBLIC_DIR = resolve(process.cwd(), 'public')

/**
 * `assetsVitePlugin({ devMiddleware: true })` runs the RPC/WS backend on its
 * own side-car port and lets Vite serve the SPA. `ctx.views.hostStatic()`
 * therefore mounts the raw asset bytes on the side-car origin, not Vite's —
 * so the SPA's origin-relative `<img src="/__…-raw/…">` would 404 against
 * Vite. Re-serve the same directory on Vite's own origin so those relative
 * URLs resolve. Dev-only; the standalone CLI serves both on one origin.
 */
function rawAssetsDevServer() {
  return {
    name: 'assets:dev-raw-static',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse, next?: (err?: Error) => void) => void) => void } }) {
      server.middlewares.use(RAW_BASE.replace(/\/$/, ''), serveStaticNodeMiddleware(PUBLIC_DIR))
    },
  }
}

export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [
    preact(),
    UnoCSS(),
    assetsVitePlugin({ devMiddleware: true, base: '/' }),
    rawAssetsDevServer(),
  ],
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    outDir: fileURLToPath(new URL('../../dist/spa', import.meta.url)),
    emptyOutDir: true,
  },
})
