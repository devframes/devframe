import type { StorybookConfig } from '@storybook/html-vite'
import UnoCSS from 'unocss/vite'

// Each devframe plugin ships its own framework-specific Storybook (React, Vue,
// Svelte, Solid, vanilla). This host is a thin shell that composes them into one
// UI via Storybook refs — every plugin becomes its own top-level section.
//
//  - In DEVELOPMENT each plugin runs its own dev server on a fixed port and the
//    host references it live (`pnpm storybook` starts all of them in parallel).
//  - In PRODUCTION `scripts/build.mjs` builds each plugin's Storybook into a
//    subfolder of this host's static output, so the refs resolve on one origin.
const sections = [
  { id: 'git', title: 'Git', port: 6011 },
  { id: 'inspect', title: 'Inspect', port: 6012 },
  { id: 'code-server', title: 'Code Server', port: 6013 },
  { id: 'terminals', title: 'Terminals', port: 6014 },
  { id: 'a11y', title: 'A11y', port: 6015 },
]

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  refs: (_config, { configType }) => Object.fromEntries(
    sections.map(({ id, title, port }) => [
      id,
      { title, url: configType === 'DEVELOPMENT' ? `http://localhost:${port}` : `./${id}` },
    ]),
  ),
  viteFinal(viteConfig) {
    viteConfig.plugins ??= []
    viteConfig.plugins.push(UnoCSS())
    return viteConfig
  },
}

export default config
