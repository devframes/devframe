import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// The hub UI composes the shared devframe base (see `design/uno.config.ts`).
// Pair with `@antfu/design/styles.css` (imported in `src/client/main.ts`). `.ts`
// is opted into extraction since the hub authors its class strings in vanilla
// `src/client/main.ts`; `.vue` is scanned too since the JSON-render dock pulls
// in @antfu/design SFCs.
export default mergeConfigs([
  designConfig,
  {
    // The JSON-render dock renders @devframes/json-render-ui, whose `Badge`
    // picks a `badge-color-<name>` at runtime — safelist the fixed set.
    safelist: ['badge-color-green', 'badge-color-amber', 'badge-color-red', 'badge-color-blue'],
    content: { pipeline: { include: [/\.(?:vue|[cm]?[jt]sx?|html)($|\?)/] } },
  },
])
