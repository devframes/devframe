import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetIcons,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// This example's Preact SPA uses `@antfu/design` directly for its semantic
// tokens, class vocabulary and Phosphor icons — matching the built-in plugins.
// The named `z-*` layers are the app's to own (the preset blocks plain `z-<n>`).
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
  content: { pipeline: { include: [/\.(?:[cm]?[jt]sx?|html)($|\?)/] } },
})
