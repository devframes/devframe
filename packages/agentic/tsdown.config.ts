import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'mcp/index': 'src/mcp/index.ts',
    'connect/index': 'src/connect/index.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: true,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'node',
})
