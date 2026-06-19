import type { Decorator, Preview } from '@storybook/react-vite'
import { useEffect } from 'react'
import '../src/client/app/globals.css'

const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme ?? 'dark'
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return (
    <div className="bg-background text-foreground min-h-svh p-6">
      <div className="mx-auto max-w-2xl">
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
