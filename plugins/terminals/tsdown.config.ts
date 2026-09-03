import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

const deps = {
  neverBundle: [
    'vite',
    'esbuild',
    'postcss',
    'rolldown',
  ],
}

// Node + neutral modules: the devframe definition/factory (root), the setup
// module, the CLI adapter, the host adapters, constants, types, and the RPC
// registry. The Svelte component library (`app/client`) and the SPA host
// (`app`) build separately with Vite.
const nodeEntries = {
  'node/index': 'src/node/index.ts',
  'node/setup': 'src/node/setup.ts',
  'node/cli': 'src/node/cli.ts',
  'node/vite': 'src/node/vite.ts',
  'node/constants': 'src/node/constants.ts',
  'node/types': 'src/node/types.ts',
  'node/rpc/index': 'src/node/rpc/index.ts',
}

/**
 * Two configs keep the graphs isolated:
 * 1. node runtime (`clean: true`): clears dist/, builds the node entries;
 * 2. combined dts in one neutral graph so the `declare module 'devframe'` RPC
 *    augmentation resolves once.
 */
export default defineConfig([
  {
    clean: true,
    platform: 'node',
    tsconfig,
    deps,
    dts: false,
    entry: nodeEntries,
  },
  {
    clean: false,
    platform: 'neutral',
    tsconfig,
    deps,
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: nodeEntries,
  },
])
