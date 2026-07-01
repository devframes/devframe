import type { Decorator, Preview } from '@storybook/html-vite'
import 'virtual:uno.css'
import '@antfu/design/styles.css'

// The host shell tracks the same theme convention as every composed plugin: dark
// mode is the `.dark` class on `<html>`, and the canvas takes the semantic
// `bg-base`/`color-base` surface.
function applyTheme(theme: string): void {
  document.documentElement.classList.toggle('dark', theme !== 'light')
  document.body.classList.add('bg-base', 'color-base', 'font-sans')
}

const withTheme: Decorator = (story, context) => {
  applyTheme(context.globals.theme ?? 'dark')
  return story(context)
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
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
