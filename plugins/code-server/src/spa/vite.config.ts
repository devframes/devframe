import { fileURLToPath } from 'node:url'
import { viteDevBridge } from 'devframe/helpers/vite'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'
import { createCodeServerDevframe } from '../index'

// The launcher SPA. `base: './'` keeps every asset URL relative so the bundle
// is mount-path portable — it discovers its runtime base from
// `document.baseURI` and connects via `connectDevframe()`. The build is copied
// verbatim by `createBuild`; no HTML rewriting.
//
// `viteDevBridge({ devMiddleware: true })` runs a side-car devframe RPC + WS
// server during `vite dev` so the launcher can detect/start/stop code-server
// while Vite serves the UI source with HMR.
export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [
    UnoCSS(),
    viteDevBridge(createCodeServerDevframe(), { devMiddleware: true, base: '/' }),
  ],
  build: {
    outDir: fileURLToPath(new URL('../../dist/spa', import.meta.url)),
    emptyOutDir: true,
  },
})
