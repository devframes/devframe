import { mergeConfigs } from 'unocss'
import { designConfig } from '../design/uno.config'

// The unified host's own welcome/overview surface composes the shared devframe
// base (see `design/uno.config.ts`). Only the host shell reads this config; each
// composed plugin generates its own CSS from its own `uno.config.ts`. The
// welcome page is hand-written vanilla `.ts`, so `.ts` is opted into extraction.
export default mergeConfigs([
  designConfig,
  {
    content: {
      pipeline: {
        include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/],
      },
    },
  },
])
