import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// The hub UI composes the shared devframe base (see `design/uno.config.ts`).
// Pair with `@antfu/design/styles.css` (imported in `src/client/main.ts`). `.ts`
// is opted into extraction since the hub authors its class strings in vanilla
// `src/client/main.ts`.
export default mergeConfigs([
  designConfig,
  {
    content: { pipeline: { include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/] } },
  },
])
