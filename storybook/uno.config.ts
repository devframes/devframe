import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetIcons,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// The unified host's own welcome/overview surface uses `@antfu/design` directly,
// with the same stack every plugin composes: the sage-green preset over a Wind4
// base, Phosphor icons, DM Sans/Mono and the directive/variant-group
// transformers. Only the host shell reads this config; each composed plugin
// generates its own CSS from its own `uno.config.ts`. The welcome page is
// hand-written vanilla `.ts`, so `.ts` is opted into the extraction pipeline.
export default defineConfig({
  presets: [
    presetAnthonyDesign({ primary: '#3a6a45' }),
    presetWind4(),
    presetIcons({ scale: 1.1 }),
    presetWebFonts({ provider: 'none', fonts: { sans: 'DM Sans', mono: 'DM Mono' } }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  // Wind4 leaves bare `border`/`border-b` at currentColor; restore the subtle
  // shared border color (matching `border-base`) for unqualified borders.
  preflights: [{ getCSS: () => '*,::before,::after{border-color:#8882}' }],
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
      include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/],
    },
  },
})
