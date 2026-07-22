import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// The messages panel composes the shared devframe base (see
// `design/uno.config.ts`) and adds only its own extraction globs. Vue templates
// are scanned by default; `.ts` is opted in for class strings authored in
// helpers (e.g. the level/source style maps).
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
