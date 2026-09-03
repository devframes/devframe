import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

/**
 * The a11y inspector's Solid SPA composes the shared devframe base (see
 * `design/uno.config.ts`) and adds only its own extraction globs. The in-page
 * page script (src/client-script/page-script) is deliberately excluded, since it inlines its own styles
 * into the host document. `.tsx` is scanned by default; `.ts` (the co-located
 * `design.ts` helpers) is opted in.
 */
export default mergeConfigs([
  designConfig,
  {
    content: {
      pipeline: {
        include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/],
      },
    },
    safelist: [
      'sr-only',
    ],
  },
])
