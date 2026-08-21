export default defineAppConfig({
  seo: {
    siteName: 'Devframe',
  },

  header: {
    title: 'Devframe',
    logo: {
      alt: 'Devframe',
      light: '/logo.svg',
      dark: '/logo.svg',
    },
    nav: [
      {
        label: 'Guide',
        sections: ['guide'],
      },
      {
        label: 'Adapters',
        sections: ['adapters', 'frameworks', 'helpers'],
      },
      { label: 'Plugins', sections: ['plugins'], link: 'section' as const },
      { label: 'Errors', sections: ['errors'], link: 'section' as const },
    ],
  },

  github: {
    owner: 'devframes',
    name: 'devframe',
    branch: 'main',
    contentDir: 'docs/content',
  },

  footer: {
    links: [
      {
        'icon': 'i-lucide-rss',
        'to': '/rss.xml',
        'target': '_blank',
        'aria-label': 'Devframe RSS Feed',
      },
      {
        'icon': 'i-simple-icons-github',
        'to': 'https://github.com/devframes/devframe',
        'target': '_blank',
        'aria-label': 'Devframe on GitHub',
      },
    ],
  },

  docs: {
    // Labeled sidebar groups per content section, consumed by the shadowed
    // `useFilteredNavigation` composable (mirrors the old VitePress sidebar).
    sidebarGroups: {
      guide: [
        { title: 'Introduction', items: ['/guide'] },
        {
          title: 'Define your tool',
          items: [
            '/guide/devframe-definition',
            '/guide/rpc',
            '/guide/shared-state',
            '/guide/streaming',
            '/guide/client-assets',
            '/guide/scoped-context',
            '/guide/json-render',
            '/guide/diagnostics',
            '/guide/when-clauses',
          ],
        },
        {
          title: 'Mount anywhere',
          items: [
            '/adapters/initiate',
            '/adapters',
            '/guide/standalone-cli',
            '/guide/client',
            '/guide/transports',
            '/guide/security',
          ],
        },
        { title: 'Agentic', items: ['/guide/agent-native'] },
        {
          title: 'Compose a hub',
          items: [
            '/guide/hub',
            '/guide/client-context',
            '/guide/hub-initiate',
            '/guide/services',
            '/guide/deep-linking',
            '/guide/events',
          ],
        },
        {
          title: 'Customize the UI',
          items: [
            '/guide/build-your-own-json-render-frontend',
            '/guide/build-your-own-hub-ui',
          ],
        },
        { title: 'Ecosystem', items: ['/guide/built-with'] },
        {
          title: 'Migrations',
          items: [
            '/guide/migration-0.9',
            '/guide/migration-0.8',
            '/guide/migration-0.7',
            '/guide/migration-0.6',
          ],
        },
      ],
    },
    ogImage: {
      tagline: 'Build a devtool once. Mount it anywhere.',
    },
    llms: {
      description:
        'Framework-neutral foundation for building devtools — one definition becomes a Web Standard handler, a CLI, a static report, an MCP server, or a hub dock.',
    },
    schemaOrg: {
      description:
        'Framework-neutral foundation for building devtools — RPC layer, hosts, and adapters.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      license: 'https://github.com/devframes/devframe/blob/main/LICENSE.md',
      sameAs: ['https://github.com/devframes/devframe', 'https://devfra.me'],
      programmingLanguage: 'TypeScript',
    },
  },

  ui: {
    colors: {
      primary: 'green',
      neutral: 'neutral',
    },
  },
})
