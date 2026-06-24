import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    preset: 'src/preset.ts',
    tokens: 'src/tokens.ts',
  },
  outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
  clean: true,
  tsconfig: '../../tsconfig.base.json',
  dts: true,
  platform: 'neutral',
  deps: {
    neverBundle: [
      'unocss',
      '@unocss/core',
      '@unocss/preset-wind4',
      '@unocss/preset-icons',
    ],
  },
})
