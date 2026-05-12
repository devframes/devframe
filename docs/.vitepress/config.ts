import type { DefaultTheme } from 'vitepress'
import { fileURLToPath } from 'node:url'
import { globSync } from 'tinyglobby'
import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import pkg from '../../packages/devframe/package.json' with { type: 'json' }

const errorsDir = fileURLToPath(new URL('../errors/', import.meta.url))

const repo = 'https://github.com/devframes/devframe'
const brandColor = '#517158'

function listErrorCodes(prefix: string): string[] {
  return globSync(`${prefix}*.md`, { cwd: errorsDir })
    .map(f => f.replace(/\.md$/, ''))
    .sort()
}

function guideItems(prefix: string): DefaultTheme.NavItemWithLink[] {
  return [
    { text: 'Introduction', link: `${prefix}/guide/` },
    { text: 'Devframe Definition', link: `${prefix}/guide/devframe-definition` },
    { text: 'RPC', link: `${prefix}/guide/rpc` },
    { text: 'Shared State', link: `${prefix}/guide/shared-state` },
    { text: 'Streaming', link: `${prefix}/guide/streaming` },
    { text: 'When Clauses', link: `${prefix}/guide/when-clauses` },
    { text: 'Structured Diagnostics', link: `${prefix}/guide/diagnostics` },
    { text: 'Client', link: `${prefix}/guide/client` },
    { text: 'Standalone CLI', link: `${prefix}/guide/standalone-cli` },
    { text: 'Agent-Native (experimental)', link: `${prefix}/guide/agent-native` },
  ]
}

function adaptersItems(prefix: string): DefaultTheme.NavItemWithLink[] {
  return [
    { text: 'Overview', link: `${prefix}/adapters/` },
    { text: 'CLI', link: `${prefix}/adapters/cli` },
    { text: 'Dev', link: `${prefix}/adapters/dev` },
    { text: 'Build', link: `${prefix}/adapters/build` },
    { text: 'Vite', link: `${prefix}/adapters/vite` },
    { text: 'Embedded', link: `${prefix}/adapters/embedded` },
    { text: 'MCP', link: `${prefix}/adapters/mcp` },
  ]
}

function helpersItems(prefix: string): DefaultTheme.NavItemWithLink[] {
  return [
    { text: 'Overview', link: `${prefix}/helpers/` },
    { text: 'Utilities', link: `${prefix}/helpers/utilities` },
    { text: 'Vite Bridge', link: `${prefix}/helpers/vite-bridge` },
    { text: 'Nuxt Module', link: `${prefix}/helpers/nuxt` },
    { text: 'Open Helpers', link: `${prefix}/helpers/open-helpers` },
  ]
}

export function devframeSidebar(prefix = ''): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'Guide',
      items: guideItems(prefix),
    },
    {
      text: 'Adapters',
      items: adaptersItems(prefix),
    },
    {
      text: 'Helpers',
      items: helpersItems(prefix),
    },
    {
      text: 'Error Reference',
      link: `${prefix}/errors/`,
      collapsed: true,
      items: listErrorCodes('DF').map(code => ({
        text: code,
        link: `${prefix}/errors/${code}`,
      })),
    },
  ]
}

export function devframeNav(prefix = ''): DefaultTheme.NavItem[] {
  return [
    { text: 'Guide', items: guideItems(prefix) },
    { text: 'Adapters', items: adaptersItems(prefix) },
    { text: 'Helpers', items: helpersItems(prefix) },
    { text: 'Errors', link: `${prefix}/errors/` },
    {
      text: `v${pkg.version}`,
      items: [
        { text: 'Release Notes', link: `${repo}/releases` },
        { text: 'Contributing', link: `${repo}/blob/main/CONTRIBUTING.md` },
      ],
    },
  ]
}

export default withMermaid(defineConfig({
  title: 'Devframe',
  description: 'Framework-neutral foundation for building generic DevTools — RPC layer, hosts, and adapters.',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/logo.svg' }],
    ['link', { rel: 'mask-icon', href: '/logo.svg', color: brandColor }],
    ['meta', { name: 'theme-color', content: brandColor }],
  ],
  themeConfig: {
    logo: { light: '/logo.svg', dark: '/logo.svg' },
    nav: devframeNav(),
    sidebar: devframeSidebar(),
    search: {
      provider: 'local',
    },
    socialLinks: [
      { icon: 'github', link: repo },
    ],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Suggest changes to this page',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025-present Anthony Fu & Contributors',
    },
    lastUpdated: {
      text: 'Last updated',
    },
  },
  mermaid: {
    theme: 'base',
    flowchart: {
      curve: 'basis',
      padding: 20,
      nodeSpacing: 50,
      rankSpacing: 60,
      useMaxWidth: true,
    },
    sequence: {
      actorMargin: 80,
      boxMargin: 10,
      boxTextMargin: 5,
      noteMargin: 10,
      messageMargin: 40,
      useMaxWidth: true,
    },
  },
}))
