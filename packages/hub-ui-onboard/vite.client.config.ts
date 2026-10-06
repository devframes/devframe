import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * The stand-in floating button: one self-contained ES module served at
 * `<base>embedded.js`, the same URL the hub serves its own bootstrap from,
 * so a host injects one script tag and either file answers. Styles live in
 * the shadow root (`.generated/css.ts`), so no CSS asset is emitted.
 */
export default defineConfig({
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/client/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'embedded.js',
    },
  },
})
