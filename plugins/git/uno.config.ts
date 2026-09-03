import { fileURLToPath } from 'node:url'
import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// The Git dashboard composes the shared devframe base (see `design/uno.config.ts`).
// `@unocss/postcss` (see app/postcss.config.mjs) and Storybook both load this
// config. Absolute globs keep class extraction working regardless of the
// working directory PostCSS runs in (Next builds from `app`).
const app = fileURLToPath(new URL('./app', import.meta.url))

export default mergeConfigs([
  designConfig,
  {
    content: {
      filesystem: [
        `${app}/app/**/*.{ts,tsx}`,
        `${app}/components/**/*.{ts,tsx}`,
        `${app}/lib/**/*.{ts,tsx}`,
      ],
    },
  },
])
