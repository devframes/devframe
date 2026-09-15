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
    // Both are types-only in this package's public dts: `@standard-schema/spec`
    // (a devDependency) and `nostics` (reached via `devframe/utils/nostics`,
    // runtime import stays external on the devframe peer). Whitelisting them
    // lets the dts bundler inline the type declarations so consumers need
    // neither package installed for `@devframes/json-render`'s types.
    onlyBundle: [
      '@standard-schema/spec',
      'nostics',
    ],
  },
})
