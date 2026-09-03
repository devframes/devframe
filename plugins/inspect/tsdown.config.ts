import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Client runtime script: imported by the hub client runtime, which already has
// `devframe` on hand, so `devframe/client` stays external.
const clientEntries = {
  'client-script/client/index': 'src/client-script/client/index.ts',
}

// Node-side entries: the devframe definition (root), the setup module, the
// CLI adapter, and the RPC registry.
const nodeEntries = {
  'node/index': 'src/node/index.ts',
  'node/setup': 'src/node/setup.ts',
  'node/cli': 'src/node/cli.ts',
  'node/rpc/index': 'src/node/rpc/index.ts',
}

/**
 * Three configs keep the graphs isolated:
 * 1. browser client runtime (`clean: true`): clears dist/, `devframe` external;
 * 2. node runtime (appends);
 * 3. combined dts in one graph so the `declare module 'devframe'` RPC
 *    augmentation resolves once.
 *
 * The Vue panel SPA (`app/`) builds separately with Vite into the lockstep
 * `@devframes/plugin-inspect--assets` package.
 */
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
    entry: nodeEntries,
  },
  {
    clean: false,
    platform: 'neutral',
    tsconfig,
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: { ...clientEntries, ...nodeEntries },
  },
])
