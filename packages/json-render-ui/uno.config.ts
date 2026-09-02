import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import { shadowSurfaceSafelist } from '../../design/uno.config'

/**
 * The reference frontend uses `@antfu/design` directly: its preset (tuned to
 * devframe's sage green) over a Wind3 base, Phosphor icons, DM Sans/Mono and
 * the directive/variant-group transformers. Component class strings are
 * authored in `.ts` render functions, so `.ts` is opted into extraction. The
 * named `z-*` layers are the app's to own (the preset blocks plain `z-<number>`).
 *
 * **Wind3**, not the Wind4 the other devframe surfaces use: the prebuilt
 * renderer module injects its compiled stylesheet into its own shadow root,
 * where Wind4's theme/`--un-*` custom properties (behind a document `:root {}`
 * block and `@property { inherits: false }`) don't reach. Wind3 bakes
 * `@antfu/design`'s semantic utilities to concrete `rgb()` + `.dark` variants,
 * self-contained inside the shadow tree; `shadowSurfaceSafelist` guarantees
 * the surface/text tokens ship even when a shortcut only appears via a `.dark:`
 * variant the extractor misses.
 */
export default defineConfig({
  presets: [
    presetAnthonyDesign({ primary: '#3a6a45' }),
    presetWind3(),
    presetIcons({ scale: 1.1 }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  /**
   * `Badge` picks a `badge-color-<name>` at runtime from a fixed set, so those
   * classes can't be found by static extraction, so safelist them, alongside the
   * shadow-root surface/text tokens.
   */
  safelist: [...shadowSurfaceSafelist, 'badge-color-green', 'badge-color-amber', 'badge-color-red', 'badge-color-blue'],
  shortcuts: {
    'bg-panel-raised': 'bg-hover',
    'bg-panel-sunken': 'bg-code',
    'z-nav': 'z-[30]',
    'z-dropdown': 'z-[40]',
    'z-tooltip': 'z-[45]',
    'z-toast': 'z-[50]',
    'z-modal-backdrop': 'z-[60]',
    'z-modal-content': 'z-[70]',
    'z-drawer-backdrop': 'z-[80]',
    'z-drawer-content': 'z-[90]',
  },
  content: {
    pipeline: {
      include: [/\.(?:vue|[cm]?[jt]sx?|html)($|\?)/],
    },
  },
})
