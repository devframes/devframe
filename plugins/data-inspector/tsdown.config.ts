import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Inject endpoint: loaded via `node --import`. It runs in the user's Node
// process (node:http, node:fs, devframe/node), so it builds on the node
// platform with `devframe` external, resolved as a peer at runtime.
const injectEntries = {
  'inject/index': 'src/inject/index.ts',
}

// Node-side entries: the devframe definition (root), the setup module, the
// CLI adapter, the RPC registry, the isomorphic query engine, and the
// source registry.
const nodeEntries = {
  'node/index': 'src/node/index.ts',
  'node/setup': 'src/node/setup.ts',
  'node/cli': 'src/node/cli.ts',
  'node/rpc/index': 'src/node/rpc/index.ts',
  'node/engine/index': 'src/node/engine/index.ts',
  'node/registry/index': 'src/node/registry/index.ts',
}

export default defineConfig([
  {
    clean: true,
    platform: 'node',
    tsconfig,
    dts: false,
    outExtensions: () => ({ js: '.mjs' }),
    entry: injectEntries,
  },
  {
    clean: false,
    platform: 'node',
    tsconfig,
    dts: false,
    entry: nodeEntries,
  },
  // One dts graph PER entry: a single-entry graph can never split shared
  // chunks, so declarations always inline and the emitted .d.mts files are
  // byte-deterministic (a combined graph let rolldown hoist entry contents
  // into shared chunks nondeterministically, flaking the tsnapi snapshots).
  ...Object.entries({ ...injectEntries, ...nodeEntries }).map(([name, source]) => ({
    clean: false,
    platform: 'neutral' as const,
    tsconfig,
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: { [name]: source },
  })),
])
