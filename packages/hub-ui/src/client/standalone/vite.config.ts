import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The standalone viewer SPA the hub serves at its base
// (`DevframeHubUi.viewer`). Built with relative asset paths so the output is
// mount-path agnostic — the hub copies it verbatim wherever its base lives.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [Vue()],
  build: {
    outDir: fileURLToPath(new URL('../../../dist/client/standalone', import.meta.url)),
    emptyOutDir: true,
  },
})
