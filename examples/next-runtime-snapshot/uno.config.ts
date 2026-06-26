import { fileURLToPath } from 'node:url'
import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// This example extends the shared devframe design system. `@unocss/postcss`
// (see src/client/postcss.config.mjs) loads this config; the absolute glob keeps
// class extraction working regardless of the directory Next builds from.
const client = fileURLToPath(new URL('./src/client', import.meta.url))

export default defineConfig({
  content: {
    filesystem: [`${client}/app/**/*.{ts,tsx}`],
  },
  presets: [presetDevframe()],
})
