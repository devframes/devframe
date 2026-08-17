import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { devframeVite } from '@devframes/vite/single'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'pathe'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'
import createAssetsDevframe from '../index'

// The plugin manages `<cwd>/public` and (as a mounted plugin) does NOT serve
// those bytes itself — it references the host's URLs. Here the host is Vite,
// so in dev point Vite's own `publicDir` at the managed directory and it
// serves the fixtures at `/` (matching the default `baseURL`), exactly as a
// real Vite app serves its `public/` folder. Disabled for `build` so the
// fixtures never get copied into the shipped SPA dist.
export default defineConfig(({ command }) => ({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: command === 'serve' ? resolve(process.cwd(), 'public') : false,
  resolve: { alias },
  plugins: [
    vue(),
    UnoCSS(),
    devframeVite(createAssetsDevframe(), { bridge: true, base: '/' }),
  ],
  // `@antfu/design` ships raw `.ts`/`.vue`; let `@vitejs/plugin-vue` compile
  // its SFCs instead of esbuild pre-bundling them.
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    outDir: fileURLToPath(new URL('../../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
}))
