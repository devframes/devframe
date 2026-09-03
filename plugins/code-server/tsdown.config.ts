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

// Client runtime script: imported by the hub client runtime, which already has
// `devframe` on hand, so `devframe/client` stays external.
const clientEntries = {
  'client-script/client/index': 'src/client-script/client/index.ts',
}

// Node-side entries: the devframe definition (root), the setup module, the
// CLI adapter, the host adapters, constants, types, and the RPC registry.
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
 * Three configs keep the graphs isolated:
 * 1. browser client runtime (`clean: true`): clears dist/, `devframe` external;
 * 2. node runtime (appends);
 * 3. combined dts in one graph so the `declare module 'devframe'` RPC
 *    augmentation resolves once.
 *
 * The Vue panel SPA (`app/`) builds separately with Vite into the lockstep
 * `@devframes/plugin-code-server--assets` package.
 */
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
    entry: nodeEntries,
  },
  {
    clean: false,
    platform: 'neutral',
    tsconfig,
    deps,
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: { ...clientEntries, ...nodeEntries },
  },
])
