import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

const clientEntries = {
  'client/index': 'src/client/index.ts',
}

const serverEntries = {
  'index': 'src/index.ts',
  'cli': 'src/cli.ts',
  'vite': 'src/vite.ts',
  'node/index': 'src/node/index.ts',
  'rpc/index': 'src/rpc/index.ts',
}

export default defineConfig([
  {
    clean: true,
    platform: 'browser',
    tsconfig,
    dts: false,
    outExtensions: () => ({ js: '.mjs' }),
    entry: clientEntries,
  },
  {
    clean: false,
    platform: 'node',
    tsconfig,
    dts: false,
    entry: serverEntries,
  },
  {
    clean: false,
    platform: 'neutral',
    tsconfig,
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: { ...clientEntries, ...serverEntries },
  },
])
