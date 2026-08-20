import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Builds the standalone SPA into `dist/client` (the definition's `cli.distDir`).
// `base: './'` keeps every asset URL relative so the same bundle works under
// any mount path - the CLI static build, the single playground, or a hub dock.
export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('../../dist/client', import.meta.url)),
    emptyOutDir: true,
  },
})
