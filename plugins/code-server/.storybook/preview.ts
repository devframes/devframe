import type { Preview } from '@storybook/html-vite'
import 'virtual:uno.css'
import '@antfu/design/styles.css'
import '../src/client/style.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
  },
}

export default preview
