import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Builds the host-page agent into a single self-contained ES module
// (`dist/inject/inject.js`) with axe-core bundled in. Loaded by the host app
// via `<script type="module" src=".../inject.js">`, so it must not rely on a
// chunk graph or an import map.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    target: 'esnext',
    outDir: fileURLToPath(new URL('../../dist/inject', import.meta.url)),
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'inject.js',
    },
  },
})
