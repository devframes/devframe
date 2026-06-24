import type { Preview } from '@storybook/vue3'
import 'virtual:uno.css'
import '../src/spa/style.css'

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
