import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'constants': 'src/constants.ts',
    'client/index': 'src/client/index.ts',
    'node/index': 'src/node/index.ts',
    'node/initiate': 'src/node/initiate.ts',
    'types/index': 'src/types/index.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: true,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'neutral',
  deps: {
    neverBundle: [
      'vite',
      'esbuild',
      'postcss',
      'rolldown',
    ],
    onlyBundle: [
      'acorn',
      'get-port-please',
      'mlly',
    ],
  },
})
