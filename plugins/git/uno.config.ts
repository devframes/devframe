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

// The Git dashboard uses `@antfu/design` directly: its preset (tuned to
// devframe's sage green) over a Wind4 base, with Phosphor icons, DM Sans/Mono and
// the directive/variant-group transformers. `@unocss/postcss` (see
// src/client/postcss.config.mjs) and Storybook both load this config. Absolute
// globs keep class extraction working regardless of the working directory
// PostCSS runs in (Next builds from `src/client`).
const client = fileURLToPath(new URL('./src/client', import.meta.url))

export default defineConfig({
  content: {
    filesystem: [
      `${client}/app/**/*.{ts,tsx}`,
      `${client}/components/**/*.{ts,tsx}`,
      `${client}/lib/**/*.{ts,tsx}`,
    ],
  },
  presets: [
    presetAnthonyDesign({ primary: '#3a6a45' }),
    presetWind4(),
    presetIcons({ scale: 1.1 }),
    presetWebFonts({ provider: 'none', fonts: { sans: 'DM Sans', mono: 'DM Mono' } }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
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
  // Wind4 leaves bare `border`/`border-b` at currentColor; restore the subtle
  // shared border color (matching `border-base`) for unqualified borders.
  preflights: [{ getCSS: () => '*,::before,::after{border-color:#8882}' }],
})
