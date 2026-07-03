import type { Decorator, Preview } from '@storybook/vue3-vite'
import 'virtual:uno.css'
import '@antfu/design/styles.css'
import '../src/client/style.css'

// Drive the shared `@antfu/design` tokens off the toolbar theme toggle: dark mode
// is the `.dark` class on `<html>`, and the canvas takes the semantic
// `bg-base`/`color-base` surface — matching every other devframe surface.
function applyTheme(theme: string): void {
  document.documentElement.classList.toggle('dark', theme !== 'light')
  document.body.classList.add('bg-base', 'color-base', 'font-sans')
}

const withTheme: Decorator = (story, context) => {
  applyTheme(context.globals.theme ?? 'dark')
  return { components: { story }, template: '<story />' }
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  globalTypes: {
    theme: {
      description: 'Color theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
}

export default preview
