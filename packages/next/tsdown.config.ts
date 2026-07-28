import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: './src/index.ts',
  platform: 'node',
  tsconfig: '../../tsconfig.base.json',
  clean: true,
  dts: true,
  outExtensions: () => ({ dts: '.d.mts' }),
})
