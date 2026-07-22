import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'

// The out-of-box standalone SPA. `base: './'` keeps every asset URL relative so
// the bundle is mount-path portable — it discovers its runtime base from
// `document.baseURI` and connects via `connectDevframe()`. devframe's dev/build
// adapters serve this directory verbatim (no HTML rewriting) when an app wires
// `cli.distDir = jsonRenderSpaDir`.
export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [UnoCSS(), vue()],
  // `@antfu/design` (pulled in by the renderer) ships raw `.vue`; let
  // `@vitejs/plugin-vue` compile its SFCs instead of esbuild pre-bundling.
  optimizeDeps: { exclude: ['@antfu/design', '@devframes/json-render-ui'] },
  build: {
    outDir: fileURLToPath(new URL('../../dist/spa', import.meta.url)),
    emptyOutDir: true,
  },
})
