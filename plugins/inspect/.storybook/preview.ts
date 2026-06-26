import type { Preview } from '@storybook/vue3'
import 'virtual:uno.css'
import '@internal/design/theme.css'
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
      values: [
        {
          name: 'dark',
          value: '#111111',
        },
        {
          name: 'light',
          value: '#ffffff',
        },
      ],
    },
  },
}

export default preview
