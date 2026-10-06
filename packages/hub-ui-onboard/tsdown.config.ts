import { defineConfig } from 'tsdown'

/**
 * Node-side entry only (`createOnboarding()`). The browser bundle is built
 * by `vite.client.config.ts` into `dist/client/embedded.js`.
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
