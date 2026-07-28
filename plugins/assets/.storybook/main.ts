import type { StorybookConfig } from '@storybook/vue3-vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { mergeConfig } from 'vite'
import { alias } from '../../../alias'

const config: StorybookConfig = {
  stories: ['../src/spa/app/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {},
  },
  async viteFinal(viteConfig) {
    return mergeConfig(viteConfig, {
      resolve: { alias },
      plugins: [vue(), UnoCSS()],
      // Dev tool reached from arbitrary hostnames (LAN IPs, tunnels, tailnets),
      // e.g. when iframed by the storybook-hub example: accept any Host header.
      server: { allowedHosts: true },
    })
  },
}

export default config
