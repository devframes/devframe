// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  pnpm: true,
  ignores: [
    'skills',
    '**/dist',
    '**/.vitepress/cache',
    '**/.vitepress/dist',
  ],
})
