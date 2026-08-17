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
// the setup module, the source registry, and the in-process inject entry.
const serverEntries = {
  'index': 'src/index.ts',
  'cli': 'src/cli.ts',
  'node/index': 'src/node/index.ts',
  'registry/index': 'src/registry/index.ts',
  'inject/index': 'src/inject/index.ts',
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
    // jora is loaded via a lazy `import('jora')` in `engine/query-engine.ts`
    // (only paid for on the first query), and inlined here so that lazy
    // import resolves a chunk shipped inside this package's own `dist`
    // instead of a `node_modules` lookup consumers would otherwise need to
    // satisfy just to load the RPC functions. The browser build (SPA,
    // `engine/index` client entry) keeps jora external/dependency-resolved,
    // since jora already loads eagerly there for query-editor syntax gating.
    deps: { alwaysBundle: ['jora'] },
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
