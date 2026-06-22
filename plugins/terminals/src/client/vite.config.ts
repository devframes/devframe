import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { alias } from '../../../../alias'

export default defineConfig({
  resolve: { alias },
  plugins: [
    svelte(),
    UnoCSS(),
    cssInjectedByJsPlugin(),
  ],
  build: {
    outDir: fileURLToPath(new URL('../../dist/client', import.meta.url)),
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      // Don't externalize xterm/xterm-addon-fit so it works out of the box in custom-render,
      // but do externalize devframe/client since the host provides it.
      external: ['devframe/client'],
    },
  },
})
