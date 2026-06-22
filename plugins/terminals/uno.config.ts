import { defineConfig, presetIcons, presetUno } from 'unocss'

export default defineConfig({
  shortcuts: [
    {
      'color-base': 'text-gray-800 dark:text-gray-300',
      'bg-base': 'bg-white dark:bg-[#111]',
      'bg-secondary': 'bg-gray-100 dark:bg-[#222]',
      'border-base': 'border-gray-200 dark:border-[#333]',

      'color-active': 'text-primary-600 dark:text-primary-400',
      'border-active': 'border-primary-600/25 dark:border-primary-400/25',
      'bg-active': 'bg-primary-500/10 dark:bg-primary-400/10',

      'btn-action': 'border border-base rounded flex gap-1 items-center px-2.5 py-1 text-xs transition-colors hover:bg-active disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
      'btn-action-active': 'color-active border-active bg-active',

      'tab-btn': 'inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-md border border-transparent text-xs cursor-pointer transition-colors bg-secondary text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200',
      'tab-btn-active': 'bg-base text-gray-800 dark:text-gray-200 border-base',
    },
  ],
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
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
    }),
  ],
})
