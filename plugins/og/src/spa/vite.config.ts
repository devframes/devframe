import { fileURLToPath } from 'node:url'
import { devframeVite } from '@devframes/vite/single'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'
import createOgDevframe from '../index'

export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [
    vue(),
    UnoCSS(),
    devframeVite(createOgDevframe(), { bridge: true, base: '/' }),
  ],
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    outDir: fileURLToPath(new URL('../../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
})
