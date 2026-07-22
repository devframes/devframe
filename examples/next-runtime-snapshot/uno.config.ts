import { fileURLToPath } from 'node:url'
import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// This example composes the shared devframe base (see `design/uno.config.ts`).
// `@unocss/postcss` (see src/client/postcss.config.mjs) loads this config; the
// absolute glob keeps class extraction working regardless of the directory Next
// builds from. The co-located `app/design.ts` (carrying `@unocss-include`) is
// covered by the same glob.
const client = fileURLToPath(new URL('./src/client', import.meta.url))

export default mergeConfigs([
  designConfig,
  {
    content: {
      filesystem: [`${client}/app/**/*.{ts,tsx}`],
    },
  },
])
