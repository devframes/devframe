import type { StorybookConfig } from '@storybook/html-vite'
import UnoCSS from 'unocss/vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  viteFinal(viteConfig) {
    viteConfig.plugins ??= []
    viteConfig.plugins.push(UnoCSS())
    return viteConfig
  },
}

export default config
