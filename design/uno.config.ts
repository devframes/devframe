import { fileURLToPath } from 'node:url'
import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetIcons,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// Shared devframe UnoCSS base. Every plugin and example composes `@antfu/design`
// the same way — its preset (tuned to devframe's sage green) over a Wind4 base,
// Phosphor icons, DM Sans/Mono web fonts, and the directive/variant-group
// transformers — so the surfaces look and feel like one product across
// frameworks. Each app extends this via `mergeConfigs([designConfig, { … }])`
// and contributes only its own extraction globs (and any safelist).
//
// The shared web fonts (`sans`/`mono`), the named `z-*` layers and the `h-nav`
// navbar height live here so every surface shares one font stack, one z-index
// scale and one fixed navbar height. The `@antfu/design` preset blocks plain
// `z-<number>`, so the layers are named on purpose.
export const designConfig = defineConfig({
  presets: [
    presetAnthonyDesign({ primary: '#3a6a45' }),
    presetWind4(),
    presetIcons({ scale: 1.1 }),
    presetWebFonts({ provider: 'none', fonts: { sans: 'DM Sans', mono: 'DM Mono' } }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  // The shared class-helper builders (`design/design.ts`) assemble their class
  // chains at runtime, so every app scans that one file (it carries
  // `@unocss-include`) for extraction regardless of its own framework globs.
  content: {
    filesystem: [fileURLToPath(new URL('./design.ts', import.meta.url))],
  },
  // Wind4 leaves bare `border`/`border-b` at currentColor; restore the subtle
  // shared border color (matching `border-base`) for unqualified borders.
  preflights: [{ getCSS: () => '*,::before,::after{border-color:#8882}' }],
  shortcuts: {
    // Fixed navbar height, shared by every surface's top nav.
    'h-nav': 'h-10',
    // Named z-index layers, shared across every surface.
    'z-nav': 'z-[30]',
    'z-dropdown': 'z-[40]',
    'z-tooltip': 'z-[45]',
    'z-toast': 'z-[50]',
    'z-modal-backdrop': 'z-[60]',
    'z-modal-content': 'z-[70]',
    'z-drawer-backdrop': 'z-[80]',
    'z-drawer-content': 'z-[90]',
  },
})

export default designConfig
