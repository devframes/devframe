import { fileURLToPath } from 'node:url'
import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// The hub UI composes the shared devframe base (see `design/uno.config.ts`).
// `@unocss/postcss` (see postcss.config.mjs) loads this config; absolute globs
// keep class extraction working regardless of the directory PostCSS runs in.
const client = fileURLToPath(new URL('./src/client', import.meta.url))
// The mini React json-render registry is shared with the Next hub example —
// scan it too so its class strings are extracted here.
const nextJsonRender = fileURLToPath(new URL('../next-devframe-hub/src/client/json-render', import.meta.url))

export default mergeConfigs([
  designConfig,
  {
    // The mini React json-render registry sets `badge-color-<name>` from a fixed
    // set — these literals live in source, but safelist them to be explicit.
    safelist: ['badge-color-green', 'badge-color-amber', 'badge-color-red', 'badge-color-blue'],
    content: {
      filesystem: [
        `${client}/**/*.{ts,tsx,html}`,
        `${nextJsonRender}/**/*.{ts,tsx}`,
      ],
    },
  },
])
