import { fileURLToPath } from 'node:url'
import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// The Git dashboard extends the shared devframe design system. `@unocss/postcss`
// (see src/client/postcss.config.mjs) and Storybook both load this config.
// Absolute globs keep class extraction working regardless of the working
// directory PostCSS runs in (Next builds from `src/client`).
const client = fileURLToPath(new URL('./src/client', import.meta.url))

export default defineConfig({
  content: {
    filesystem: [
      `${client}/app/**/*.{ts,tsx}`,
      `${client}/components/**/*.{ts,tsx}`,
      `${client}/lib/**/*.{ts,tsx}`,
    ],
  },
  presets: [presetDevframe()],
})
