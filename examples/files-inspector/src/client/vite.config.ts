import { fileURLToPath } from 'node:url'
import preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'

export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [UnoCSS(), preact()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/client', import.meta.url)),
    emptyOutDir: true,
  },
})
