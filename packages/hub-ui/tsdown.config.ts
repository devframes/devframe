import { defineConfig } from 'tsdown'

/**
 * Node-side entry only (`createUi()`); the browser bundles - the embedded
 * dock bootstrap and the standalone viewer - are built by the two Vite
 * configs (`vite.embedded.config.ts`, `src/client/standalone/vite.config.ts`).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: false,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'node',
})
