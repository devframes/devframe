import type { Decorator, Preview } from '@storybook/vue3-vite'
import { h } from 'vue'
import 'virtual:uno.css'
import 'floating-vue/dist/style.css'
import '@antfu/design/styles.css'

const withTheme: Decorator = (story, context) => {
  const theme = context.globals.theme ?? 'dark'
  document.documentElement.classList.toggle('dark', theme !== 'light')
  return () => h(
    'div',
    { class: 'flex h-svh justify-center bg-base p-6 color-base font-sans' },
    [h('div', { class: 'flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-base p-3' }, [h(story())])],
  )
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
