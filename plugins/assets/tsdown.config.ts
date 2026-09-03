import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Node-side entries: the devframe definition (root), the setup module, the
// CLI adapter, and the RPC registry.
const nodeEntries = {
  'node/index': 'src/node/index.ts',
  'node/setup': 'src/node/setup.ts',
  'node/cli': 'src/node/cli.ts',
  'node/rpc/index': 'src/node/rpc/index.ts',
}

/**
 * Two configs keep the graphs isolated:
 * 1. node runtime (`clean: true`): clears dist/;
 * 2. dts in one graph so the `declare module 'devframe'` RPC
 *    augmentation resolves once.
 *
 * The Vue panel SPA (`app/`) builds separately with Vite into the lockstep
 * `@devframes/plugin-assets--assets` package.
 */
export default defineConfig([
  {
    clean: true,
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
    entry: nodeEntries,
  },
])
