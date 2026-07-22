import { defineConfig } from 'tsdown'

// Browser-only library. Vue and the protocol package are peers, so they stay
// external (the consuming app / hub host provides them). Components are plain
// `ComponentFn` render functions in `.ts`, so no SFC compiler is needed.
export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'components/index': 'src/components/index.ts',
    // Node-safe entry: exposes the prebuilt SPA path + a devframe wiring
    // helper. Imports no Vue / `@antfu/design`, only `node:url`.
    'spa': 'src/spa.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: true,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'browser',
  deps: {
    // Keep peers external; `@antfu/design` ships `.vue` source that the
    // consumer's Vite (with @vitejs/plugin-vue) compiles, so it must not be
    // bundled/parsed here.
    neverBundle: ['vue', '@antfu/design', /^@antfu\/design\//, '@devframes/json-render', '@devframes/json-render/core'],
  },
})
