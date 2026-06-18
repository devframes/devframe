import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'

// The inspector SPA. `base: './'` keeps every asset URL relative so the
// bundle is mount-path portable — it discovers its runtime base from
// `document.baseURI` and connects via `connectDevframe()`. The build is
// copied verbatim by `createBuild`/`createSpa`; no HTML rewriting.
export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/spa', import.meta.url)),
    emptyOutDir: true,
  },
})
