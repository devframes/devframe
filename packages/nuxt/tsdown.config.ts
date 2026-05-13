import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { defineConfig } from 'tsdown'

const require = createRequire(import.meta.url)

export default defineConfig([{
  entry: './src/module.ts',
  // tsconfig: '../../tsconfig.base.json',
  clean: true,
  dts: true,
  exports: false,
  // Keep transitive Nuxt/Vite type graphs out of dts bundling. Consumers
  // resolve these via their own node_modules at install time.
  deps: {
    neverBundle: [
      '@nuxt/kit',
      '@nuxt/schema',
      '@vitejs/plugin-vue-jsx',
      '@vue/babel-plugin-jsx',
      '@vue/babel-plugin-resolve-type',
      'scule',
    ],
  },
}, {
  // just transpile the plugin to esm: we don't need the runtime at subpackage exports
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
      const { name, version, devDependencies } = require('./package.json')
      // copy types and generate plugin d.ts, module types.d.mts and module.json files
      await Promise.all([
        fs.cp('src/runtime/types.d.ts', 'dist/runtime/types.d.ts'),
        fs.writeFile('dist/runtime/plugin.client.d.ts', `import type { Plugin } from '#app';
import type { DevToolsRpcClient } from 'devframe/client';
declare const plugin: Plugin<{
  rpc: DevToolsRpcClient;
}>;
export default plugin;
`, 'utf-8'),
        fs.writeFile('dist/types.d.mts', `export { default } from './module.mjs'

export { type ModuleOptions, type DevframeNuxtModuleOptions } from './module.mjs'
`, 'utf-8'),
        fs.writeFile('dist/module.json', `{
  "name": "${name}",
  "configKey": "devframe",
  "version": "${version}",
  "builder": {
    "tsdown": "${devDependencies.tsdown}"
  }        
}
`, 'utf-8'),
      ])
    },
  },
}])
