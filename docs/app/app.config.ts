export default defineAppConfig({
  seo: {
    siteName: 'Devframe',
  },

  header: {
    title: 'Devframe',
    logo: {
      alt: 'Devframe',
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
