import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

/**
 * The shared devframe design base (see `design/uno.config.ts`); `.ts` is
 * opted into extraction since this example authors its class strings in
 * vanilla `src/main.ts`.
 */
export default mergeConfigs([
  designConfig,
  {
    content: { pipeline: { include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/] } },
  },
])
