import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Browser-loaded entries. Kept in their own rolldown graph so node-only
// imports can never leak into the client bundle. The engine is isomorphic:
// it runs server-side for live queries and client-side for static exports.
const clientEntries = {
  'client/index': 'src/client/index.ts',
  'engine/index': 'src/engine/index.ts',
}

// Node-side entries — the devframe definition, the CLI/Vite host adapters,
// the setup module, the source registry, and the in-process agent.
const serverEntries = {
  'index': 'src/index.ts',
  'cli': 'src/cli.ts',
  'vite': 'src/vite.ts',
  'node/index': 'src/node/index.ts',
  'registry/index': 'src/registry/index.ts',
  'agent/index': 'src/agent/index.ts',
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
  // One dts graph PER entry: a single-entry graph can never split shared
  // chunks, so declarations always inline and the emitted .d.mts files are
  // byte-deterministic (a combined graph let rolldown hoist entry contents
  // into shared chunks nondeterministically, flaking the tsnapi snapshots).
  ...Object.entries({ ...clientEntries, ...serverEntries }).map(([name, source]) => ({
    clean: false,
    platform: 'neutral' as const,
    tsconfig,
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: { [name]: source },
  })),
])
