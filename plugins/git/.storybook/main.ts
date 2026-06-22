import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-oxc'

const config: StorybookConfig = {
  stories: ['../src/client/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal(viteConfig) {
    viteConfig.plugins ??= []
    // Vite 8 bundles with rolldown/oxc, which doesn't transform JSX on its
    // own; the React plugin wires up the automatic runtime so `.tsx` stories
    // and views parse.
    viteConfig.plugins.push(react(), tailwindcss())
    return viteConfig
  },
}

export default config
