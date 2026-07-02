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
    // Dev tool reached from arbitrary hostnames (LAN IPs, tunnels, tailnets),
    // e.g. when iframed by the storybook-hub example: accept any Host header.
    viteConfig.server = { ...viteConfig.server, allowedHosts: true }
    return viteConfig
  },
}

export default config
