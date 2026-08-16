import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'
import { inspectVitePlugin } from '../vite'

// The inspector SPA. `base: './'` keeps every asset URL relative so the
// bundle is mount-path portable — it discovers its runtime base from
// `document.baseURI` and connects via `connectDevframe()`. The build is
// copied verbatim by `createBuild`; no HTML rewriting.
export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [
    vue(),
    UnoCSS(),
    inspectVitePlugin({ bridge: true, base: '/' }),
  ],
  // `@antfu/design` ships raw `.ts`/`.vue`; let `@vitejs/plugin-vue` compile its
  // SFCs instead of esbuild pre-bundling them.
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    // Emit into the sibling `@devframes/plugin-inspect-assets` package, which
    // ships these assets to npm; the node package stays slim and serves them
    // on demand through devframe's remote-assets back-proxy.
    outDir: fileURLToPath(new URL('../../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
})
