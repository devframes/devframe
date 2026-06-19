// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  pnpm: true,
  ignores: [
    'skills',
    '**/dist',
    '**/storybook-static',
    '**/.next',
    '**/out',
    '**/next-env.d.ts',
    '**/.vitepress/cache',
    '**/.vitepress/dist',
  ],
})
