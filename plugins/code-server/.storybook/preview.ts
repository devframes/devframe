import type { Preview } from '@storybook/html-vite'
import '../src/client/style.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
  },
}

export default preview
