import type { Decorator, Preview } from '@storybook/preact-vite'
import { useEffect } from 'preact/hooks'
import '@antfu/design/styles.css'
import 'virtual:uno.css'

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme ?? 'dark'
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return (
    <div class="flex h-svh justify-center bg-base p-6 color-base font-sans">
      <div class="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-base p-3">
        <Story />
      </div>
    </div>
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
