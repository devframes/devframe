import { mergeConfigs, presetWind3 } from 'unocss'
import { createDesignConfig, shadowSurfaceSafelist } from '../../design/uno.config'

// The shared devframe design base (see `design/uno.config.ts` and the root
// AGENTS.md "Design system" section) plus this package's own extraction
// globs and the dock-shell z-layers. The generated stylesheet is compiled
// ahead of time by `scripts/build-css.ts` into `src/client/.generated/css.ts`
// and injected into the dock custom element's **shadow root**.
//
// Composed on a **Wind3** base rather than the shared default's Wind4:
// `@antfu/design`'s semantic utilities compile to concrete `rgb()` + `.dark`
// variants under Wind3, which are self-contained inside a shadow tree — Wind4
// keeps its theme/`--un-*` behind a document `:root {}` block and
// `@property { inherits: false }`, neither of which reaches the shadow root.
// The `safelist` guarantees the surface/text tokens ship even if a shortcut
// class only appears via a `.dark:` variant the extractor misses.
export default mergeConfigs([
  createDesignConfig({ base: presetWind3() }),
  {
    safelist: shadowSurfaceSafelist,
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
