import type { StorybookConfig } from '@storybook/svelte-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import UnoCSS from 'unocss/vite'
import { mergeConfig } from 'vite'
import { alias } from '../../../alias'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|svelte)'],
  framework: {
    name: '@storybook/svelte-vite',
    options: {},
  },
  // `@storybook/svelte-vite` only wires Svelte docgen — it expects the Svelte
  // compiler plugin to come from a project `vite.config` (ours lives at a
  // non-default path), so add `svelte()` here. UnoCSS auto-loads the plugin-root
  // `uno.config.ts`; the shared aliases let `devframe/*` imports resolve without
  // a prior build.
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: { alias },
      plugins: [svelte(), UnoCSS()],
    })
  },
}

export default config
