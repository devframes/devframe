import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// This example's Preact SPA composes the shared devframe base (see
// `design/uno.config.ts`) and adds only its own extraction globs.
export default mergeConfigs([
  designConfig,
  {
    content: { pipeline: { include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/] } },
  },
])
