import { mergeConfigs } from 'unocss'
import { designConfig } from '../../design/uno.config'

// The terminals panel composes the shared devframe base (see
// `design/uno.config.ts`) and adds only its own extraction globs and safelist.
// Svelte is scanned by default; `.ts` (the co-located `design.ts` class helpers)
// is opted in.
export default mergeConfigs([
  designConfig,
  {
    // Icons for terminal sessions contributed by *other* devframes through the
    // hub (e.g. code-server) arrive as runtime strings, so UnoCSS can't extract
    // them from source. Safelist the built-in plugins' dock icons so those
    // aggregated sessions render with their proper glyph.
    safelist: [
      'i-ph-code-duotone',
      'i-ph-terminal-window-duotone',
      'i-ph-git-branch-duotone',
      'i-ph-magnifying-glass-duotone',
      'i-ph-person-arms-spread-duotone',
    ],
    content: {
      pipeline: {
        include: [/\.(?:svelte|[cm]?[jt]sx?|html)($|\?)/],
      },
    },
  },
])
