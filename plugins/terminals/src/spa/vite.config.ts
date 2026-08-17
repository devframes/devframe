import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'

export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [
    svelte(),
    UnoCSS(),
  ],
  build: {
    outDir: fileURLToPath(new URL('../../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
})
