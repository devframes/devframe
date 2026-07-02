import type { StorybookConfig } from 'storybook-solidjs-vite'
import UnoCSS from 'unocss/vite'
import { mergeConfig } from 'vite'
import { alias } from '../../../alias'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: {
    name: 'storybook-solidjs-vite',
    options: {},
  },
  // `storybook-solidjs-vite` wires `vite-plugin-solid` itself; we only add UnoCSS
  // (auto-loading the plugin-root `uno.config.ts`) and the shared source aliases
  // so `devframe/*` imports resolve without a prior build.
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: { alias },
      plugins: [UnoCSS()],
      // Dev tool reached from arbitrary hostnames (LAN IPs, tunnels,
      // tailnets), e.g. when iframed by the storybook-hub example.
      server: { allowedHosts: true },
    })
  },
}

export default config
