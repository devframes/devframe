// @ts-check
import antfu, { parserPlain } from '@antfu/eslint-config'

export default antfu({
  pnpm: true,
  antislop: {
    slop: {
      inspection: 'full',
    },
  },
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
  /**
   * The antislop `no-em-dash` rule scans every source glob, including CSS,
   * HTML, and Vue/Svelte `<style>` blocks that have no JS parser here. Parse
   * them as plain text so the rule reads their raw content without erroring.
   */
  files: ['**/*.css', '**/*.scss', '**/*.less', '**/*.pcss', '**/*.postcss', '**/*.html', '**/*.htm', '**/*.svelte'],
  languageOptions: {
    parser: parserPlain,
  },
}, {
  /**
   * MDC component syntax (`::u-page-hero`, `#title` slot markers) is not
   * ATX-heading markdown - don't lint it as such.
   */
  files: ['docs/content/**/*.md'],
  rules: {
    'markdown/no-missing-atx-heading-space': 'off',
  },
})
