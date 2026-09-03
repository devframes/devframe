import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Injected client script: loaded into the user app's page via a bare
// `<script type="module">`, so it must be one self-contained ES module with no
// chunk graph. axe-core and `devframe/in-page-channel` are bundled in.
const clientScriptEntries = {
  'client-script/index': 'src/client-script/index.ts',
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
 * 1. browser client script (`clean: true`): clears dist/, self-contained
 *    (`alwaysBundle` inlines devframe + axe);
 * 2. node runtime (appends);
 * 3. combined dts in one graph so the `declare module 'devframe'` RPC
 *    augmentation resolves once.
 *
 * The Solid panel SPA (`app/`) builds separately with Vite into the lockstep
 * `@devframes/plugin-a11y--assets` package.
 */
export default defineConfig([
  {
    clean: true,
    platform: 'browser',
    tsconfig,
    dts: false,
    outExtensions: () => ({ js: '.mjs' }),
    deps: { alwaysBundle: [/^devframe(\/|$)/, 'axe-core'] },
    entry: clientScriptEntries,
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
    entry: { ...clientScriptEntries, ...nodeEntries },
  },
])
