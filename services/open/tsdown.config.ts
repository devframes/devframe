import { defineConfig } from 'tsdown'

export default defineConfig({
  platform: 'node',
  tsconfig: '../../tsconfig.base.json',
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  entry: { index: 'src/index.ts' },
})
