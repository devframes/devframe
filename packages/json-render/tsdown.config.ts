import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'core': 'src/core.ts',
    'hub': 'src/hub.ts',
    'node/index': 'src/node/index.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: true,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'neutral',
  deps: {
    onlyBundle: [
      '@standard-schema/spec',
      // types only, via `devframe/utils/nostics` (the runtime import stays
      // external on the devframe peer)
      'nostics',
    ],
  },
})
