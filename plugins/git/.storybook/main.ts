import type { StorybookConfig } from '@storybook/react-vite'
import react from '@vitejs/plugin-react-oxc'
import UnoCSS from 'unocss/vite'

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
    viteConfig.plugins.push(react(), UnoCSS())
    // Dev tool reached from arbitrary hostnames (LAN IPs, tunnels, tailnets),
    // e.g. when iframed by the storybook-hub example: accept any Host header.
    viteConfig.server = { ...viteConfig.server, allowedHosts: true }
    return viteConfig
  },
}

export default config
