import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// The Open Graph viewer composes the shared devframe base (see
// `design/uno.config.ts`) and adds only its own extraction globs.
export default mergeConfigs([
  designConfig,
  {
    content: {
      pipeline: {
        include: [/\.(?:vue|[cm]?[jt]sx?|html)($|\?)/],
      },
    },
  },
])
