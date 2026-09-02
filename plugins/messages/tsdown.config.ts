import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Browser-loaded entry: the embeddable Vue panel. Its runtime bundle is
// produced by the Vite lib build (`src/client/vite.config.ts`, CSS injected
// via JS); tsdown only emits its declarations below.
const clientEntries = {
  'client/index': 'src/client/index.ts',
}

// Node + neutral modules: the devframe definition/factory, the RPC
// functions, and the host adapters.
const serverEntries = {
  'index': 'src/index.ts',
  'cli': 'src/cli.ts',
  'constants': 'src/constants.ts',
  'node/index': 'src/node/index.ts',
  'rpc/index': 'src/rpc/index.ts',
}

/**
 * Two configs mirror `plugins/terminals`:
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
    entry: serverEntries,
  },
  {
    clean: false,
    platform: 'neutral',
    tsconfig,
    /**
     * `client/index.ts` re-exports `useMessages(): Reactive<MessagesState>`,
     * a genuine Vue reactivity type, not just a documentation import. Without
     * this, the dts bundler inlines Vue's entire runtime-core/reactivity type
     * surface to describe `Reactive<T>` (≈935 KB); `neverBundle` keeps the
     * reference as `import('vue').Reactive<...>` instead. This build is
     * `emitDtsOnly`, so it has no effect on the JS output (built separately
     * by the Vite lib build for the client, and by the node build above).
     */
    deps: { neverBundle: ['vue'] },
    dts: { emitDtsOnly: true },
    outExtensions: () => ({ dts: '.d.mts' }),
    entry: { ...clientEntries, ...serverEntries },
  },
])
