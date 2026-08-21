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

function guideGroups(prefix: string) {
  return [
    {
      text: 'Introduction',
      items: [
        { text: 'Introduction', link: `${prefix}/guide/` },
      ],
    },
    {
      text: 'Define your tool',
      items: [
        { text: 'Devframe Definition', link: `${prefix}/guide/devframe-definition` },
        { text: 'RPC', link: `${prefix}/guide/rpc` },
        { text: 'Shared State', link: `${prefix}/guide/shared-state` },
        { text: 'Streaming', link: `${prefix}/guide/streaming` },
        { text: 'Client Assets', link: `${prefix}/guide/client-assets` },
        { text: 'Scoped Context', link: `${prefix}/guide/scoped-context` },
        { text: 'JSON-Render', link: `${prefix}/guide/json-render` },
        { text: 'Structured Diagnostics', link: `${prefix}/guide/diagnostics` },
        { text: 'When Clauses', link: `${prefix}/guide/when-clauses` },
      ],
    },
    {
      text: 'Mount anywhere',
      items: [
        { text: 'The Standard Handler', link: `${prefix}/adapters/initiate` },
        { text: 'Adapters', link: `${prefix}/adapters/` },
        { text: 'Standalone CLI', link: `${prefix}/guide/standalone-cli` },
        { text: 'Client', link: `${prefix}/guide/client` },
        { text: 'Transports', link: `${prefix}/guide/transports` },
        { text: 'Security', link: `${prefix}/guide/security` },
      ],
    },
    {
      text: 'Agentic',
      items: [
        { text: 'Agent-Native', link: `${prefix}/guide/agent-native` },
      ],
    },
    {
      text: 'Compose a hub',
      items: [
        { text: 'Hub', link: `${prefix}/guide/hub` },
        { text: 'Client Scripts & Context', link: `${prefix}/guide/client-context` },
        { text: 'Serve a Hub Anywhere', link: `${prefix}/guide/hub-initiate` },
        { text: 'Cross-Plugin Services', link: `${prefix}/guide/services` },
        { text: 'Deep Linking', link: `${prefix}/guide/deep-linking` },
        { text: 'Events Reference', link: `${prefix}/guide/events` },
      ],
    },
    {
      text: 'Customize the UI',
      items: [
        { text: 'Build Your Own JSON-Render Frontend', link: `${prefix}/guide/build-your-own-json-render-frontend` },
        { text: 'Build Your Own Hub UI', link: `${prefix}/guide/build-your-own-hub-ui` },
      ],
    },
    {
      text: 'Ecosystem',
      items: [
        { text: 'Built with Devframe', link: `${prefix}/guide/built-with` },
      ],
    },
  ] satisfies { text: string, items: DefaultTheme.NavItemWithLink[] }[]
}

function adaptersItems(prefix: string) {
  return [
    { text: 'Overview', link: `${prefix}/adapters/` },
    { text: 'The Standard Handler', link: `${prefix}/adapters/initiate` },
    { text: 'CLI', link: `${prefix}/adapters/cac` },
    { text: 'Dev', link: `${prefix}/adapters/dev` },
    { text: 'Build', link: `${prefix}/adapters/build` },
    { text: 'Vite DevTools', link: `${prefix}/adapters/vite` },
    { text: 'Embedded', link: `${prefix}/adapters/embedded` },
    { text: 'MCP', link: `${prefix}/adapters/mcp` },
  ] satisfies DefaultTheme.NavItemWithLink[]
}

function frameworksItems(prefix: string) {
  return [
    { text: 'Overview', link: `${prefix}/frameworks/` },
    { text: 'Vite', link: `${prefix}/frameworks/vite` },
    { text: 'Nuxt', link: `${prefix}/frameworks/nuxt` },
    { text: 'Next', link: `${prefix}/frameworks/next` },
  ] satisfies DefaultTheme.NavItemWithLink[]
}

function helpersItems(prefix: string) {
  return [
    { text: 'Overview', link: `${prefix}/helpers/` },
    { text: 'Utilities', link: `${prefix}/helpers/utilities` },
    { text: 'Common RPC Functions', link: `${prefix}/helpers/common-rpc-functions` },
    { text: 'Interactive Auth', link: `${prefix}/helpers/interactive-auth` },
  ] satisfies DefaultTheme.NavItemWithLink[]
}

function pluginsItems(prefix: string) {
  return [
    { text: 'Overview', link: `${prefix}/plugins/` },
    { text: 'Data Inspector', link: `${prefix}/plugins/data-inspector` },
    { text: 'Devframe Inspector', link: `${prefix}/plugins/inspect` },
    { text: 'Open Graph Viewer', link: `${prefix}/plugins/og` },
    { text: 'Accessibility Inspector', link: `${prefix}/plugins/a11y` },
    { text: 'Git', link: `${prefix}/plugins/git` },
    { text: 'Terminals', link: `${prefix}/plugins/terminals` },
    { text: 'Code Server', link: `${prefix}/plugins/code-server` },
    { text: 'Assets', link: `${prefix}/plugins/assets` },
  ] satisfies DefaultTheme.NavItemWithLink[]
}

export function devframeSidebar(prefix = ''): DefaultTheme.SidebarItem[] {
  return [
    {
      text: 'Guide',
      // Labelled, collapsible subsections instead of one long flat list.
      items: guideGroups(prefix).map(group => ({ ...group, collapsed: false })),
    },
    {
      text: 'Adapters',
      items: adaptersItems(prefix),
    },
    {
      text: 'Frameworks',
      items: frameworksItems(prefix),
    },
    {
      text: 'Helpers',
      items: helpersItems(prefix),
    },
    {
      text: 'Plugins',
      items: pluginsItems(prefix),
    },
  ]
}

export function devframeNav(prefix = ''): DefaultTheme.NavItem[] {
  return [
    {
      text: 'Guide',
      items: guideGroups(prefix),
    },
    {
      text: 'Adapters',
      items: [
        ...adaptersItems(prefix),
        { text: 'Frameworks', items: frameworksItems(prefix) },
        { text: 'Helpers', items: helpersItems(prefix) },
      ],
    },
    { text: 'Plugins', items: pluginsItems(prefix) },
    { text: 'Errors', link: `${prefix}/errors/` },
    {
      text: `v${pkg.version}`,
      items: [
        { text: 'Release Notes', link: `${repo}/releases` },
        { text: 'Contributing', link: `${repo}/blob/main/CONTRIBUTING.md` },
        {
          items: [
            { text: 'Migrating to 0.9', link: `${prefix}/guide/migration-0.9` },
            { text: 'Migrating to 0.8', link: `${prefix}/guide/migration-0.8` },
            { text: 'Migrating to 0.7', link: `${prefix}/guide/migration-0.7` },
            { text: 'Migrating to 0.6', link: `${prefix}/guide/migration-0.6` },
          ],
        },
      ],
    },
  ]
}

export default withMermaid(defineConfig({
  title: 'Devframe',
  description: 'Framework-neutral foundation for building generic devframes — RPC layer, hosts, and adapters.',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/logo.svg' }],
    ['link', { rel: 'mask-icon', href: '/logo.svg', color: brandColor }],
    ['meta', { name: 'theme-color', content: brandColor }],
  ],
  themeConfig: {
    logo: { light: '/logo.svg', dark: '/logo.svg' },
    nav: devframeNav(),
    sidebar: {
      '/': devframeSidebar(),
      '/errors/': [
        {
          text: 'Error Reference',
          link: '/errors/',
          collapsed: true,
          items: listErrorCodes('DF').map(code => ({
            text: code,
            link: `/errors/${code}`,
          })),
        },
      ],
    },
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
