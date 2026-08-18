import { defineConfig } from 'tsdown'

// Node-safe entries only. The browser renderer (Vue components, the upstream
// renderer, the `@antfu/design` ports) ships exclusively as self-contained
// Vite bundles — the standalone SPA (`src/spa/vite.config.ts`) and the hub
// renderer module (`src/renderer-module/vite.config.ts`) — both of which
// inline vue, `@json-render/vue`, and `@antfu/design` at build time, so no
// frontend package leaks out as a runtime dependency.
//
// These two tsdown entries expose only path/registration helpers pointing at
// those prebuilt bundles; their sole imports are node built-ins plus a couple
// of type-only references. Keep those types external (`neverBundle`) so the
// emitted `.d.mts` references the packages instead of inlining their whole
// type graph.
export default defineConfig({
  entry: {
    // Node-safe entry: the prebuilt SPA path + a devframe wiring helper.
    // Imports only `node:url` (plus a `devframe` type).
    spa: 'src/spa.ts',
    // Node-safe entry: the hub renderer-manifest registration pointing at the
    // prebuilt module in `dist/renderer/` (built by its own Vite config).
    hub: 'src/hub.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: true,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'node',
  deps: {
    // Type-only references in these node entries — keep them external so the
    // `.d.mts` references each package rather than inlining its type graph.
    neverBundle: [
      'devframe',
      '@devframes/hub',
      '@devframes/hub/initiate',
      '@devframes/json-render',
      '@devframes/json-render/hub',
      '@devframes/json-render/core',
    ],
  },
})
