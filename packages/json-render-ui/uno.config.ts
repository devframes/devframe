import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetIcons,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// The reference frontend uses `@antfu/design` directly: its preset (tuned to
// devframe's sage green) over a Wind4 base, Phosphor icons, DM Sans/Mono and
// the directive/variant-group transformers. Component class strings are
// authored in `.ts` render functions, so `.ts` is opted into extraction. The
// named `z-*` layers are the app's to own (the preset blocks plain `z-<number>`).
export default defineConfig({
  presets: [
    presetAnthonyDesign({ primary: '#3a6a45' }),
    presetWind4(),
    presetIcons({ scale: 1.1 }),
    presetWebFonts({ provider: 'none', fonts: { sans: 'DM Sans', mono: 'DM Mono' } }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  preflights: [{ getCSS: () => '*,::before,::after{border-color:#8882}' }],
  // `Badge` picks a `badge-color-<name>` at runtime from a fixed set, so those
  // classes can't be found by static extraction — safelist them.
  safelist: ['badge-color-green', 'badge-color-amber', 'badge-color-red', 'badge-color-blue'],
  shortcuts: {
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
