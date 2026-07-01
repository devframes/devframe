import type { Preview } from '@storybook/vue3-vite'
import 'virtual:uno.css'
import '@antfu/design/styles.css'
import '../src/spa/style.css'

// Stories default to the dark canvas; drive the shared tokens to match.
document.documentElement.classList.add('dark')

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      options: {
        dark: { name: 'Dark', value: '#111111' },
        light: { name: 'Light', value: '#ffffff' },
      },
    },
  },
}

export default preview
