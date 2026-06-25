import { fileURLToPath } from 'node:url'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { alias } from '../../../../alias'

// `base: './'` + `<base href="./" />` keeps the bundle mount-path portable:
// the same `dist/spa` works whether devframe serves it at `/` (standalone)
// or `/__devframe-a11y-inspector/` (mounted in a hub). `connectDevframe`
// resolves its connection meta relative to `document.baseURI` to match.
export default defineConfig({
  base: './',
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  plugins: [solid(), UnoCSS()],
  build: {
    outDir: fileURLToPath(new URL('../../dist/spa', import.meta.url)),
    emptyOutDir: true,
  },
})
