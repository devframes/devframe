import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'

export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [UnoCSS(), vue()],
  // `@antfu/design` (pulled in by @devframes/json-render-ui) ships raw `.vue`;
  // let @vitejs/plugin-vue compile its SFCs instead of esbuild pre-bundling.
  optimizeDeps: { exclude: ['@antfu/design', '@devframes/json-render-ui'] },
  build: {
    outDir: fileURLToPath(new URL('../../dist/client', import.meta.url)),
    emptyOutDir: true,
  },
})
