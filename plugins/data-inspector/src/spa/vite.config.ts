import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'
import { dataInspectorVitePlugin } from '../vite'

// The data-inspector SPA. `base: './'` keeps every asset URL relative so the
// bundle is mount-path portable — it discovers its runtime base from
// `document.baseURI` and connects via `connectDevframe()`. The build is
// copied verbatim by `createBuild`/`createSpa`; no HTML rewriting.
//
// `dataInspectorVitePlugin({ devMiddleware: true })` dogfoods the plugin: it
// runs a side-car RPC + WS backend (with the built-in example source) next to
// this HMR frontend, so `pnpm dev` is a full devframe dev server, not a
// backend-less SPA.
export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  // discovery (or a dep) references the Node-style `global`; webpack shims it
  // by default, Vite needs the classic define.
  define: { global: 'globalThis' },
  plugins: [
    vue(),
    UnoCSS(),
    dataInspectorVitePlugin({ devMiddleware: true, base: '/' }),
  ],
  // `@antfu/design` ships raw `.ts`/`.vue`; let `@vitejs/plugin-vue` compile its
  // SFCs instead of esbuild pre-bundling them.
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    outDir: fileURLToPath(new URL('../../dist/spa', import.meta.url)),
    emptyOutDir: true,
  },
})
