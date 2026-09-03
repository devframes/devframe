import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Node + neutral modules only: the devframe definition/factory, the setup
// module, the RPC functions, the CLI adapter, and the shared constants. The
// Vue component library (`./client`) and the SPA host build separately with
// Vite (`app/client/vite.config.ts`, `app/vite.config.ts`).
const nodeEntries = {
  'node/index': 'src/node/index.ts',
  'node/setup': 'src/node/setup.ts',
  'node/cli': 'src/node/cli.ts',
  'node/constants': 'src/node/constants.ts',
  'node/rpc/index': 'src/node/rpc/index.ts',
}

/**
 * Two configs mirror the other plugins:
 * 1. node runtime build (`dts: false`, `clean: true`);
 * 2. combined dts (`emitDtsOnly`): one rolldown graph so the
 * `declare module 'devframe'` RPC augmentation resolves once.
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
    /**
     * The RPC list types reference `@devframes/hub` message types; keep Vue
     * external so the dts bundler references `import('vue').Reactive<...>`
     * rather than inlining Vue's reactivity type surface. This build is
     * `emitDtsOnly`, so it has no effect on the JS output.
     */
    deps: { neverBundle: ['vue'] },
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: nodeEntries,
  },
])
