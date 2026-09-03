import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { defineConfig } from 'tsdown'

const require = createRequire(import.meta.url)

// Keep transitive Nuxt/Vite/Vue type graphs (and the optional `@devframes/*`
// peers) out of dts bundling. Consumers resolve these via their own
// node_modules at install time.
const neverBundle = [
  '@nuxt/kit',
  '@nuxt/schema',
  '@vitejs/plugin-vue-jsx',
  '@vue/babel-plugin-jsx',
  '@vue/babel-plugin-resolve-type',
  'scule',
  'vue',
  /^@devframes\//,
]

export default defineConfig([{
  /**
   * Node/neutral entries: the throwing root, the single-devframe Nuxt module,
   * and the hub Nuxt module.
   */
  entry: {
    index: 'src/index.ts',
    single: 'src/single.ts',
    hub: 'src/hub.ts',
  },
  clean: true,
  dts: true,
  exports: false,
  outExtensions: () => ({ dts: '.d.mts' }),
  deps: { neverBundle },
}, {
  /** Browser entry: the hub client composable (Vue). */
  entry: { 'hub-client': 'src/hub-client.ts' },
  platform: 'browser',
  clean: false,
  dts: true,
  exports: false,
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  deps: { neverBundle: ['vue', 'devframe/client', /^@devframes\//] },
}, {
  /** just transpile the plugin to esm: we don't need the runtime at subpackage exports */
  entry: {
    'runtime/plugin.client': 'src/runtime/plugin.client.ts',
  },
  outExtensions: () => ({
    js: '.js',
  }),
  platform: 'browser',
  clean: false,
  dts: false,
  exports: false,
  deps: {
    neverBundle: [
      '#imports',
      'nuxt/app',
    ],
  },
  hooks: {
    'build:done': async () => {
      const tsdownPkg = require('tsdown/package.json')
      const { name, version } = require('./package.json')
      // copy runtime types + generate the client-plugin d.ts and the Nuxt
      // module metadata (describing the default `@devframes/nuxt/single` module).
      await Promise.all([
        fs.cp('src/runtime/types.d.ts', 'dist/runtime/types.d.ts'),
        fs.writeFile('dist/runtime/plugin.client.d.ts', `import type { Plugin } from '#app';
import type { DevframeRpcClient } from 'devframe/client';
declare const plugin: Plugin<{
  rpc: DevframeRpcClient;
}>;
export default plugin;
`, 'utf-8'),
        fs.writeFile('dist/module.json', `{
  "name": "${name}/single",
  "configKey": "devframe",
  "version": "${version}",
  "builder": {
    "tsdown": "${tsdownPkg.version}"
  }
}
`, 'utf-8'),
      ])
    },
  },
}])
