import devframePkg from '../../packages/devframe/package.json'

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
        sections: ['adapters', 'frameworks'],
      },
      { label: 'Add-ons', sections: ['add-ons'], link: 'section' as const },
      { label: 'Reference', sections: ['references'], link: 'section' as const },
      { label: 'Errors', sections: ['errors'], link: 'section' as const },
      {
        label: `v${devframePkg.version}`,
        to: '/migrations',
        activePath: '/migrations',
        children: [
          { label: 'Migrations overview', to: '/migrations' },
          { label: 'Migrating to 0.9', to: '/migrations/migration-0.9' },
          { label: 'Migrating to 0.8', to: '/migrations/migration-0.8' },
          { label: 'Migrating to 0.7', to: '/migrations/migration-0.7' },
          { label: 'Migrating to 0.6', to: '/migrations/migration-0.6' },
          { label: 'Release notes', to: 'https://github.com/devframes/devframe/releases' },
          { label: 'Contributing', to: 'https://github.com/devframes/devframe/blob/main/CONTRIBUTING.md' },
        ],
      },
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
        {
          title: 'Introduction',
          items: [
            '/guide',
            '/guide/getting-started',
            '/guide/tutorial-server-data-inspector',
          ],
        },
        {
          title: 'Define your tool',
          items: [
            '/guide/devframe-definition',
            '/guide/rpc',
            '/guide/shared-state',
            '/guide/client-assets',
            '/guide/scoped-context',
            '/guide/json-render',
            '/guide/diagnostics',
            '/guide/streaming',
          ],
        },
        {
          title: 'Mount anywhere',
          items: [
            '/adapters/initiate',
            '/adapters',
            '/guide/standalone-cli',
            '/guide/client',
            '/guide/in-page-channel',
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
          ],
        },
        {
          title: 'Customize the UI',
          items: [
            '/guide/build-your-own-json-render-frontend',
            '/guide/build-your-own-hub-ui',
          ],
        },
        {
          title: 'Ecosystem',
          items: ['/guide/built-with'],
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

  assistant: {
    enabled: true,
    faqQuestions: [
      {
        category: 'Getting Started',
        items: [
          'What is Devframe and what problem does it solve?',
          'How do I define a devframe and mount it with the Vite adapter?',
        ],
      },
      {
        category: 'RPC & State',
        items: [
          'How do I define an RPC function with defineRpcFunction?',
          'How does shared state stay in sync between server and client?',
        ],
      },
      {
        category: 'Adapters',
        items: [
          'What adapters can one devframe definition run under?',
          'How do I build a standalone CLI from a devframe?',
        ],
      },
      {
        category: 'Hub',
        items: [
          'How do I compose multiple devframes into a hub?',
          'How do I build my own hub UI on top of the hub protocol?',
        ],
      },
    ],
  },

  ui: {
    colors: {
      primary: 'sage',
      neutral: 'neutral',
    },
  },
})
