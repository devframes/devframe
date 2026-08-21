import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetIcons,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// The prebuilt SPA renders `@devframes/json-render-ui`, whose components author
// class strings in `.ts` render functions — so `.ts` is opted into extraction.
// Same `@antfu/design` stack (sage-green preset, Phosphor, DM Sans/Mono) as
// every other devframe surface, on the **Wind3** base the package's renderer
// module uses (`../../uno.config.ts`) so the components render identically in
// the standalone SPA and inside the shadow-root renderer module.
export default defineConfig({
  presets: [
    presetAnthonyDesign({ primary: '#3a6a45' }),
    presetWind3(),
    presetIcons({ scale: 1.1 }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  preflights: [{ getCSS: () => '*,::before,::after{border-color:#8882}' }],
  // `Badge` picks a `badge-color-<name>` at runtime from a fixed set, so those
  // classes need safelisting.
  safelist: ['badge-color-green', 'badge-color-amber', 'badge-color-red', 'badge-color-blue'],
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
    pipeline: { include: [/\.(?:vue|[cm]?[jt]sx?|html)($|\?)/] },
  },
})
