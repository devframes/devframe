import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * The embedded floating-dock bootstrap: a single, self-contained ES module
 * the hub serves at `<base>embedded.js` (see `DevframeHubUi.embedded`). One
 * file on purpose: the hub streams exactly one entry, so dynamic imports are
 * inlined and Vue rides inside the bundle. Styles live in the shadow root
 * (`.generated/css.ts`), so no CSS asset is emitted either.
 */
export default defineConfig({
  plugins: [Vue()],
  define: {
    /** Bundled for a host page: strip Vue's dev-mode branches. */
    'process.env.NODE_ENV': JSON.stringify('production'),
    '__VUE_OPTIONS_API__': 'false',
    '__VUE_PROD_DEVTOOLS__': 'false',
    '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false',
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/client/embedded/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'embedded.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
