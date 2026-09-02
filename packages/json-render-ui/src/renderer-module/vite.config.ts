import type { Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { alias } from '../../../../alias'

// Scoped `<style>` blocks in the `.vue` components get extracted into a CSS
// asset a natively-imported module can't load. Fold that CSS back into the
// entry chunk through a namespaced global the module reads when building its
// shadow-root stylesheet.
function inlineSfcCss(): Plugin {
  return {
    name: 'devframes:inline-sfc-css',
    enforce: 'post',
    generateBundle(_options, bundle) {
      let cssText = ''
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type === 'asset' && fileName.endsWith('.css')) {
          cssText += String(output.source)
          delete bundle[fileName]
        }
      }
      if (!cssText)
        return
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && output.isEntry)
          output.code = `globalThis.__DEVFRAMES_JSON_RENDER_SFC_CSS__ = ${JSON.stringify(cssText)};\n${output.code}`
      }
    },
  }
}

/**
 * The prebuilt dock-renderer module (`dist/renderer/json-render.mjs`) -
 * registered into a hub via `jsonRenderUiRenderer()` and served at
 * `<base>__renderers/json-render.mjs`, where any viewer imports it natively
 * at runtime. One self-contained file on purpose: Vue and every dependency
 * ride inside the bundle, and styles live in the module's own shadow root
 * (`src/.generated/css.ts`), so no CSS asset is emitted either.
 */
export default defineConfig({
  resolve: { alias },
  plugins: [vue(), inlineSfcCss()],
  define: {
    /** Bundled for a host page: strip Vue's dev-mode branches. */
    'process.env.NODE_ENV': JSON.stringify('production'),
    '__VUE_OPTIONS_API__': 'false',
    '__VUE_PROD_DEVTOOLS__': 'false',
    '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false',
  },
  build: {
    outDir: fileURLToPath(new URL('../../dist/renderer', import.meta.url)),
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'json-render.mjs',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
