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

// Browser-loaded module — the launcher/iframe shell. Kept in its own
// rolldown graph so the node-only supervisor never leaks into the client
// bundle.
const clientEntries = {
  'client/index': 'src/client/index.ts',
}

// Node + neutral modules — the devframe definition/factory, RPC functions,
// the code-server supervisor, and the host adapters.
const serverEntries = {
  'index': 'src/index.ts',
  'node/index': 'src/node/index.ts',
  'rpc/index': 'src/rpc/index.ts',
  'cli': 'src/cli.ts',
  'vite': 'src/vite.ts',
  'constants': 'src/constants.ts',
  'types': 'src/types.ts',
}

// Three configs, mirroring `packages/devframe/tsdown.config.ts`:
//   1. browser client build (independent graph, `.mjs`),
//   2. node server build (appends to the same dist/),
//   3. combined dts so `declare module 'devframe'` augmentations resolve
//      across every entry.
export default defineConfig([
  {
    clean: true,
    platform: 'browser',
    tsconfig,
    deps,
    dts: false,
    outExtensions: () => ({ js: '.mjs' }),
    entry: clientEntries,
  },
  {
    clean: false,
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
