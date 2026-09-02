import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// `vite`'s own type graph re-exports `esbuild`/`postcss`/`rolldown` types in a
// way that trips up rolldown's dts bundler (dozens of MISSING_EXPORT errors),
// so keep it external and let consumers resolve `Plugin`/`ViteDevServer` from
// their own installed `vite`. `@devframes/hub*` are optional peers, kept
// external so their type graphs (and node code) never inline here.
const deps = {
  neverBundle: [
    'vite',
    'esbuild',
    'postcss',
    'rolldown',
    /^@rolldown\//,
    /^@oxc-project\//,
    /^@devframes\//,
  ],
}

export default defineConfig([
  // Node entries: the throwing root, the single-devframe plugins, and the
  // hub host plugin.
  {
    entry: {
      index: 'src/index.ts',
      single: 'src/single.ts',
      hub: 'src/hub.ts',
    },
    platform: 'node',
    tsconfig,
    clean: true,
    dts: true,
    deps,
    outExtensions: () => ({ dts: '.d.mts' }),
  },
  // Browser entry: the hub client runtime helper. Its own rolldown graph so
  // node-only imports can't leak into the browser bundle.
  {
    entry: { 'hub-client': 'src/hub-client.ts' },
    platform: 'browser',
    tsconfig,
    clean: false,
    dts: true,
    deps,
    outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  },
])
