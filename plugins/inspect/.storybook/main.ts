import type { StorybookConfig } from '@storybook/vue3-vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { mergeConfig } from 'vite'
import { alias } from '../../../alias'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  docs: {},
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: { alias },
      plugins: [vue(), UnoCSS()],
    })
  },
}
export default config
