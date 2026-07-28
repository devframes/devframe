import type { StorybookConfig } from '@storybook/preact-vite'
import preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'

const config: StorybookConfig = {
  stories: ['../src/spa/app/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/preact-vite',
    options: {},
  },
  viteFinal(viteConfig) {
    viteConfig.plugins ??= []
    viteConfig.plugins.push(preact(), UnoCSS())
    // Dev tool reached from arbitrary hostnames (LAN IPs, tunnels, tailnets),
    // e.g. when iframed by the storybook-hub example: accept any Host header.
    viteConfig.server = { ...viteConfig.server, allowedHosts: true }
    return viteConfig
  },
}

export default config
