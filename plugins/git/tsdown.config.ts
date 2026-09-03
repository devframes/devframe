import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'node/index': 'src/node/index.ts',
    'node/cli': 'src/node/cli.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: true,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'node',
  // The Next.js SPA under app/ is built separately (`build:spa`);
  // tsdown only compiles the node-side entries above.
})
