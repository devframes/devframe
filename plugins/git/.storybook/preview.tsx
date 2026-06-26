import type { Decorator, Preview } from '@storybook/react-vite'
import { useEffect } from 'react'
import 'virtual:uno.css'
import '@internal/design/theme.css'

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme ?? 'dark'
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return (
    <div className="bg-background text-foreground flex h-svh justify-center p-6">
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border p-3">
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
