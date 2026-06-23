import {
  defineConfig,
  presetIcons,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  theme: {
    colors: {
      primary: {
        50: '#E9F4E7',
        100: '#D2E8CF',
        200: '#A9D3A2',
        300: '#7CBC71',
        400: '#49833E',
        DEFAULT: '#49833E',
        500: '#3F7236',
        600: '#396831',
        700: '#2C5026',
        800: '#1D3419',
        900: '#0F1C0D',
        950: '#080E07',
      },
    },
  },
  shortcuts: [
    {
      // Neutral foundations (light + dark together).
      'color-base': 'color-neutral-800 dark:color-neutral-200',
      'bg-base': 'bg-white dark:bg-#111',
      'bg-secondary': 'bg-#f6f6f7 dark:bg-#191919',
      'border-base': 'border-#8882',

      // Accents layered on top of neutrals.
      'bg-active': 'bg-#8881',
      'color-active': 'color-primary-600 dark:color-primary-300',
      'border-active': 'border-primary-600/25 dark:border-primary-400/25',

      'op-fade': 'op65 dark:op55',
      'op-mute': 'op40 dark:op30',

      // Reusable controls.
      'btn-action': 'inline-flex gap-1.5 items-center border border-base rounded px2 py1 op75 transition-colors hover:(op100 bg-active) disabled:(pointer-events-none op30)',
      'btn-action-sm': 'btn-action text-sm',
      'btn-action-active': 'color-active border-active! bg-active op100!',
      'btn-icon': 'inline-flex h-7 w-7 items-center justify-center rounded op50 transition-colors hover:(op100 bg-active) disabled:(pointer-events-none op30)',

      // Tabs.
      'tab-item': 'relative inline-flex gap-1.5 items-center max-w-52 px2 py1 rounded border border-transparent text-sm op-fade transition-colors hover:(op100 bg-active) cursor-pointer select-none',
      'tab-item-active': 'op100! bg-active border-base! color-base',

      // Status dots (real semantic state only).
      'dot-running': 'bg-primary-500 dark:bg-primary-400',
      'dot-exited': 'bg-neutral-400 dark:bg-neutral-500',
      'dot-error': 'bg-red-500',

      // Named depth layers.
      'z-nav': 'z-30',
      'z-toolbar': 'z-20',
    },
    // mode badges: badge-mode-<color>
    [/^badge-(\w+)$/, ([, color]) => `bg-${color}-400/15 text-${color}-700 dark:text-${color}-300 border border-${color}-500/20`],
  ],
  presets: [
    presetWind4(),
    presetIcons({ scale: 1.1 }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
