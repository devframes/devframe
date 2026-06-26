import { fileURLToPath } from 'node:url'
import { presetDevframe } from '@internal/design/preset'
import { defineConfig } from 'unocss'

// The hub UI extends the shared devframe design system. `@unocss/postcss` (see
// src/client/postcss.config.mjs) loads this config. Absolute globs keep class
// extraction working regardless of the directory PostCSS runs in (Next builds
// from `src/client`). Pair with `@internal/design/theme.css` (imported in
// src/client/app/layout.tsx).
const client = fileURLToPath(new URL('./src/client', import.meta.url))

export default defineConfig({
  content: {
    filesystem: [`${client}/app/**/*.{ts,tsx}`],
  },
  presets: [presetDevframe()],
})
