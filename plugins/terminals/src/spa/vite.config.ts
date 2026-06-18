import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'

export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  build: {
    outDir: fileURLToPath(new URL('../../dist/spa', import.meta.url)),
    emptyOutDir: true,
  },
})
