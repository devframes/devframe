import { presetAnthonyDesign } from '@antfu/design/unocss'
import {
  defineConfig,
  presetIcons,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// The terminals panel uses `@antfu/design` directly: its preset (tuned to
// devframe's sage green) over a Wind4 base, with Phosphor icons, DM Sans/Mono and
// the directive/variant-group transformers. The named `z-*` layers are the app's
// to own (the preset blocks plain `z-<number>`). Svelte is scanned by default;
// `.ts` (the co-located `design.ts` class helpers) is opted in.
export default defineConfig({
  presets: [
    presetAnthonyDesign({ primary: '#3a6a45' }),
    presetWind4(),
    presetIcons({ scale: 1.1 }),
    presetWebFonts({ provider: 'none', fonts: { sans: 'DM Sans', mono: 'DM Mono' } }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  // Icons for terminal sessions contributed by *other* devframes through the
  // hub (e.g. code-server) arrive as runtime strings, so UnoCSS can't extract
  // them from source. Safelist the built-in plugins' dock icons so those
  // aggregated sessions render with their proper glyph.
  safelist: [
    'i-ph-code-duotone',
    'i-ph-terminal-window-duotone',
    'i-ph-git-branch-duotone',
  ],
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
      include: [/\.(?:svelte|[cm]?[jt]sx?|html)($|\?)/],
    },
  },
})
