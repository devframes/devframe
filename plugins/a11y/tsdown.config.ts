import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Browser-loaded entry. Kept in its own rolldown graph so node-only
// imports can never leak into the client bundle.
const clientEntries = {
  'client/index': 'src/client/index.ts',
}

// Node-side entries — the devframe definition, the CLI/Vite host
// adapters, the setup module, and the RPC registry.
const serverEntries = {
  'index': 'src/index.ts',
  'cli': 'src/cli.ts',
  'vite': 'src/vite.ts',
  'node/index': 'src/node/index.ts',
  'rpc/index': 'src/rpc/index.ts',
}

// Three configs mirror `packages/devframe`:
//   1. browser runtime build (`dts: false`, `clean: true`) — clears dist/
//      and emits the client bundle in an isolated graph;
//   2. node runtime build (`dts: false`, `clean: false`) — appends;
//   3. combined dts (`emitDtsOnly`) — one rolldown graph so the
//      `declare module 'devframe'` RPC augmentation resolves once.
//
// The Solid panel SPA (`src/spa`) and the in-page agent (`src/inject`)
// build separately with Vite into `dist/spa` and `dist/inject`.
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
