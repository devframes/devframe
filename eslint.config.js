// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu({
  pnpm: true,
  ignores: [
    'skills',
    'plans',
    '**/dist',
    '**/storybook-static',
    '**/.next',
    '**/.nitro',
    '**/.output',
    '**/out',
    '**/next-env.d.ts',
    '**/.nuxt',
  ],
}, {
  // MDC component syntax (`::u-page-hero`, `#title` slot markers) is not
  // ATX-heading markdown - don't lint it as such.
  files: ['docs/content/**/*.md'],
  rules: {
    'markdown/no-missing-atx-heading-space': 'off',
  },
})
