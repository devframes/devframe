import { defineConfig } from 'tsdown'

// Browser-only library. Vue and the protocol package are peers, so they stay
// external (the consuming app / hub host provides them). Components are plain
// `ComponentFn` render functions in `.ts`, so no SFC compiler is needed.
export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'components/index': 'src/components/index.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: true,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'browser',
  deps: {
    neverBundle: ['vue', '@devframes/json-render', '@devframes/json-render/core'],
  },
})
