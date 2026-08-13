import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  platform: 'node',
  tsconfig,
  clean: true,
  dts: true,
  outExtensions: () => ({ dts: '.d.mts' }),
  // `vite`'s own type graph re-exports `esbuild`/`postcss`/`rolldown` types
  // in a way that trips up rolldown's dts bundler (dozens of
  // MISSING_EXPORT errors) — keep it external and let consumers resolve
  // `Plugin`/`ViteDevServer` from their own installed `vite`.
  deps: {
    neverBundle: [
      'vite',
      'esbuild',
      'postcss',
      'rolldown',
      /^@rolldown\//,
      /^@oxc-project\//,
    ],
  },
})
