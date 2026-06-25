import type { Preset } from 'unocss'
import {
  definePreset,
  presetIcons,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import { DF_SAFELIST } from './components'
import { radius, tokenColors } from './tokens'

export interface PresetDevframeOptions {
  /**
   * Options forwarded to `presetIcons`. The default icon scale matches the
   * inline-with-text sizing used across the built-in plugins.
   */
  icons?: Parameters<typeof presetIcons>[0]
}

/**
 * The shared `df-*` component vocabulary. These shortcuts are the cross-frame
 * "components": markup differs per framework (React, Svelte, vanilla DOM) but a
 * `df-btn df-btn-primary` button — or a `df-badge`, `df-tab`, `df-card`, … —
 * resolves to the same CSS everywhere, so they look and feel identical. The
 * definitions mirror the flagship shadcn/ui primitives so a hand-written
 * `df-btn` and a generated `<Button>` are visually interchangeable.
 */
export const shortcuts = [
  {
    // Foundations — friendly aliases onto the semantic token palette.
    'bg-base': 'bg-background',
    'color-base': 'text-foreground',
    'border-base': 'border-border',
    'bg-active': 'bg-accent',
    'color-active': 'text-primary',
    'border-active': 'border-primary/40',
    'op-fade': 'op65 dark:op75',
    'op-mute': 'op40 dark:op45',

    // Named depth layers so chrome stacks predictably.
    'z-toolbar': 'z-20',
    'z-nav': 'z-30',

    // Buttons.
    'df-btn': 'inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap select-none cursor-pointer rounded-md text-sm font-medium h-9 px-4 py-2 outline-none transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0 disabled:(pointer-events-none op50) focus-visible:(ring-[3px] ring-ring/50)',
    'df-btn-primary': 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
    'df-btn-secondary': 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
    'df-btn-outline': 'border border-border bg-background shadow-xs hover:(bg-accent text-accent-foreground)',
    'df-btn-ghost': 'hover:(bg-accent text-accent-foreground)',
    'df-btn-destructive': 'bg-destructive text-white shadow-xs hover:bg-destructive/90',
    'df-btn-link': 'text-primary underline-offset-4 hover:underline',
    // Size modifiers override the base size with `!` so they win regardless of
    // stylesheet order — no `tailwind-merge` needed in Svelte/vanilla markup.
    'df-btn-sm': 'h-8! gap-1.5! px-3!',
    'df-btn-lg': 'h-10! px-6!',
    'df-btn-icon': 'w-9! px-0!',
    'df-btn-icon-sm': 'h-7! w-7! px-0!',

    // Badges (solid / semantic) and soft tags share a silhouette.
    'df-badge': 'inline-flex items-center justify-center gap-1 w-fit shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium',
    'df-badge-primary': 'df-badge border-transparent bg-primary text-primary-foreground',
    'df-badge-secondary': 'df-badge border-transparent bg-secondary text-secondary-foreground',
    'df-badge-success': 'df-badge border-success/20 bg-success/15 text-success',
    'df-badge-warning': 'df-badge border-warning/20 bg-warning/15 text-warning',
    'df-badge-destructive': 'df-badge border-transparent bg-destructive text-white',
    'df-badge-outline': 'df-badge text-foreground',

    // Segmented view switcher (mirrors the shadcn segmented control). Sized to
    // nest inside the `df-nav` bar; tabs are content-width — add `flex-1` for an
    // equal-width strip.
    'df-tabs-list': 'inline-flex items-center justify-center w-fit h-8 gap-0.5 p-[3px] rounded-lg bg-muted text-muted-foreground',
    'df-tab': 'inline-flex items-center justify-center gap-1.5 h-[calc(100%-1px)] px-3 py-1 rounded-md border border-transparent text-sm font-medium whitespace-nowrap select-none cursor-pointer outline-none transition-colors hover:text-foreground disabled:(pointer-events-none op50) focus-visible:(ring-[3px] ring-ring/50) data-[state=active]:(bg-background text-foreground shadow-sm)',

    // Closeable navigation tabs (e.g. terminal sessions, open documents).
    'df-navtab': 'relative inline-flex items-center gap-1.5 max-w-52 px-2 py-1 rounded-md border border-transparent text-sm op-fade select-none cursor-pointer transition-colors hover:(op100 bg-accent)',
    'df-navtab-active': 'op100! bg-accent border-base! color-base',

    // Surfaces.
    'df-card': 'flex flex-col rounded-xl border border-border bg-card text-card-foreground shadow-sm',
    'df-panel': 'rounded-lg border border-border bg-card text-card-foreground',

    // Bars — one canonical top navigation strip (same height everywhere) and a
    // secondary toolbar that sits beneath it.
    'df-nav': 'z-nav flex items-center gap-2 shrink-0 h-10 px-2 border-b border-base bg-base',
    'df-toolbar': 'z-toolbar flex items-center gap-2 shrink-0 h-8 px-2.5 border-b border-base bg-secondary text-sm',
    // The leading brand block — a primary-tinted icon followed by the name —
    // so every plugin's nav opens the same way.
    'df-nav-brand': 'flex items-center gap-1.5 shrink-0 px-1 font-semibold text-sm select-none',

    // Form controls.
    'df-input': 'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground disabled:(cursor-not-allowed op50) focus-visible:(border-ring ring-[3px] ring-ring/50)',

    // Links.
    'df-link': 'text-primary underline-offset-4 hover:underline',

    // Status dots — real lifecycle states only.
    'df-dot': 'inline-block h-1.5 w-1.5 rounded-full shrink-0',
    'df-dot-running': 'bg-success',
    'df-dot-idle': 'bg-muted-foreground',
    'df-dot-error': 'bg-destructive',

    // Indeterminate spinner.
    'df-spinner': 'inline-block size-4 rounded-full border-2 border-current border-t-transparent animate-spin',
  },

  // Soft, palette-driven tags: `df-tag-blue`, `df-tag-amber`, … for ad-hoc
  // categorical labels that fall outside the semantic palette.
  [
    /^df-tag-(\w+)$/,
    ([, color]: string[]) =>
      `inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium border-${color}-500/20 bg-${color}-400/15 text-${color}-700 dark:text-${color}-300`,
  ] as [RegExp, (match: string[]) => string],
]

/**
 * The single UnoCSS preset every devframe plugin extends. It bundles
 * `presetWind4` (Tailwind-compatible utilities + class-based `dark:`),
 * `presetIcons` (Phosphor via `@iconify-json/ph`), the directive + variant-group
 * transformers, the semantic token theme, and the shared `df-*` shortcuts.
 *
 * A plugin's entire `uno.config.ts` becomes:
 *
 * ```ts
 * import { presetDevframe } from '@internal/design/preset'
 * import { defineConfig } from 'unocss'
 *
 * export default defineConfig({ presets: [presetDevframe()] })
 * ```
 *
 * Pair it with `import '@internal/design/theme.css'` once on the page to define
 * the `--df-*` token values and base element styling.
 */
export function presetDevframe(options: PresetDevframeOptions = {}): Preset {
  return definePreset({
    name: '@internal/design/preset',
    theme: {
      colors: tokenColors,
      radius,
    },
    shortcuts,
    // The `df-*` vocabulary is assembled at runtime by the component builders,
    // so it can't be statically extracted — always emit it.
    safelist: DF_SAFELIST,
    presets: [
      presetWind4(),
      presetIcons({ scale: 1.1, ...options.icons }),
    ],
    transformers: [
      transformerDirectives(),
      transformerVariantGroup(),
    ],
  })
}

export default presetDevframe
