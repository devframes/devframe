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

// Browser-loaded modules — the xterm-powered renderer. Kept in its own
// rolldown graph so node-only imports never leak into the client bundle.
const clientEntries = {
  'client/index': 'src/client/index.ts',
}

// Node + neutral modules — the devframe definition/factory, RPC functions,
// the PTY/child-process manager, and the host adapters.
const serverEntries = {
  'index': 'src/index.ts',
  'node/index': 'src/node/index.ts',
  'rpc/index': 'src/rpc/index.ts',
  'cli': 'src/cli.ts',
  'vite': 'src/vite.ts',
  'constants': 'src/constants.ts',
  'types': 'src/types.ts',
}

// Three configs:
//   1. node server build (clean: true, outputs dist/node, dist/rpc, etc.)
//   2. combined dts so augmentations resolve
export default defineConfig([
  {
    clean: true,
    platform: 'node',
    tsconfig,
    deps,
    dts: false,
    entry: serverEntries,
  },
  {
    clean: false,
    platform: 'neutral',
    tsconfig,
    deps,
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: { ...clientEntries, ...serverEntries },
  },
])
