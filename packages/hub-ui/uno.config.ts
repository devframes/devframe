import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// The shared devframe design base (see `design/uno.config.ts` and the root
// AGENTS.md "Design system" section) plus this package's own extraction
// globs and the dock-shell z-layers. The generated stylesheet is compiled
// ahead of time by `scripts/build-css.ts` into
// `src/client/.generated/css.ts` and injected into each custom element's
// shadow root, so the components stay styled in any host page without a
// global stylesheet.
export default mergeConfigs([
  designConfig,
  {
    content: {
      pipeline: {
        include: [/\.vue($|\?)/, /\.ts$/],
      },
    },
    shortcuts: {
      // Dock-shell z-layers (named — the design preset blocks plain
      // `z-<number>`). The floating shell layers sit at the very top of the
      // host page's stacking order, mirroring the upstream dock.
      'z-viewframe': 'z-[20]',
      'z-viewframe-resizer': 'z-[30]',
      'z-floating-dock': 'z-[50]',
      'z-floating-anchor': 'z-[2147483644]',
      'z-floating-tooltip': 'z-[2147483645]',
      'z-command-palette': 'z-[2147483646]',
      // The confirm modal and the toast overlay top the whole stack, above
      // the palette.
      'z-dock-confirm': 'z-[2147483647]',
      'z-dock-toast': 'z-[2147483647]',
    },
  },
])
