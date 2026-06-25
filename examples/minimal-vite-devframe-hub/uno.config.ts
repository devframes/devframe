import {
  defineConfig,
  presetIcons,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// UnoCSS config in the vite-devtools house style: semantic light/dark
// shortcuts + `presetIcons` so dock glyphs are inlined offline from
// `@iconify-json/ph` (only the icons actually referenced ship in the build).
export default defineConfig({
  theme: {
    colors: {
      primary: {
        300: '#a78bfa',
        400: '#8b5cf6',
        600: '#7c3aed',
        DEFAULT: '#8b5cf6',
      },
    },
  },
  shortcuts: [
    {
      // Neutral foundations (light + dark together).
      'color-base': 'color-neutral-800 dark:color-neutral-200',
      'bg-base': 'bg-white dark:bg-#111',
      'bg-secondary': 'bg-#f6f6f7 dark:bg-#161618',
      'border-base': 'border-#8882',

      // Accents layered on top of neutrals.
      'bg-active': 'bg-#8881',
      'color-active': 'color-primary-600 dark:color-primary-300',

      'op-fade': 'op65 dark:op55',
      'op-mute': 'op40 dark:op30',

      // The dock rail — an icon + label row with an active accent bar.
      'dock-item': 'group relative w-full flex gap-2.5 items-center border-0 rounded-lg bg-transparent px2.5 py2 text-left text-sm color-base op-fade transition-colors cursor-pointer select-none hover:(op100 bg-active)',
      'dock-item-active': 'op100! bg-active color-active font-500 before:(content-empty absolute left-0 top-1/2 h-4.5 w-0.8 origin-center scale-y-100 rounded-r bg-primary-500 -translate-y-1/2)',
      'dock-ico': 'inline-flex h-5.5 w-5.5 shrink-0 items-center justify-center text-xl op80 group-hover:op100',

      // Controls + drawer rows.
      'btn-action': 'inline-flex gap-1.5 items-center border border-base rounded bg-base px2 py1 color-base op75 transition-colors cursor-pointer hover:(op100 bg-active border-active) disabled:(pointer-events-none op30)',
      'panel-row': 'px2.5 py1.5 rounded-md border border-base bg-secondary text-xs font-mono',
      'panel-title': 'mb2 text-2.75 uppercase tracking-0.08em op-mute',

      // Status dots.
      'dot': 'inline-block h-1.75 w-1.75 rounded-full bg-current',
    },
  ],
  presets: [
    presetWind4(),
    presetIcons({ scale: 1.2 }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
