import { fileURLToPath } from 'node:url'
import { devframeViteBridge } from '@devframes/vite/single'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'
import { createMessagesDevDevframe } from './dev-host'

/**
 * The messages panel SPA. `base: './'` keeps every asset URL relative so the
 * bundle is mount-path portable, discovering its runtime base from
 * `document.baseURI` and connecting via `connectDevframe()`. The build is
 * copied verbatim by `createBuild`; no HTML rewriting.
 *
 * `pnpm dev` self-hosts through the demo-seeded dev harness (a stand-in hub
 * messages host) so the feed is lively without a full hub host.
 */
export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [
    vue(),
    UnoCSS(),
    devframeViteBridge(createMessagesDevDevframe(), { base: '/' }),
  ],
  /**
   * `@antfu/design` ships raw `.ts`/`.vue`; let `@vitejs/plugin-vue` compile its
   * SFCs instead of esbuild pre-bundling them.
   */
  optimizeDeps: { exclude: ['@antfu/design'] },
  build: {
    outDir: fileURLToPath(new URL('../../assets-pkg/dist', import.meta.url)),
    emptyOutDir: true,
  },
})
