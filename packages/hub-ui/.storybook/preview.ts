import type { Decorator, Preview } from '@storybook/vue3-vite'
import { setLocalePreference } from '../src/client/i18n'
import { HUB_UI_LOCALES } from '../src/locales'
// Reset first so uno utilities win over its resets, matching the production
// `[reset, userStyle, unoCss, ...]` order; otherwise stories lose the reset.
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '@antfu/design/styles.css'
import '../src/client/style.css'
// After uno so the primary-ramp override wins, matching the shadow-root build.
import '../../../design/primary-ramp.css'

// Drive the shared `@antfu/design` tokens off the toolbar theme toggle: dark mode
// is the `.dark` class on `<html>`, and the canvas takes the semantic
// `bg-base`/`color-base` surface, matching every other devframe surface.
function applyTheme(theme: string): void {
  document.documentElement.classList.toggle('dark', theme !== 'light')
  document.body.classList.add('bg-base', 'color-base', 'font-sans')
}

const withTheme: Decorator = (story, context) => {
  applyTheme(context.globals.theme ?? 'dark')
  setLocalePreference(context.globals.locale ?? 'en')
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
    locale: {
      description: 'UI language',
      defaultValue: 'en',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: Object.entries(HUB_UI_LOCALES).map(([value, title]) => ({ value, title })),
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
}

export default preview
