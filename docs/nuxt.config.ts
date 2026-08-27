import process from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-21',

  // Develop against a local checkout of the layer:
  // COMARK_DOCS_LAYER=../../comark-docs pnpm docs
  extends: [process.env.COMARK_DOCS_LAYER || 'comark-docs'],

  css: ['~/assets/css/devframe.css'],

  site: {
    url: 'https://devfra.me',
    name: 'Devframe',
  },

  llms: {
    domain: 'https://devfra.me',
    title: 'Devframe',
    description:
      'Framework-neutral foundation for building devtools — one definition becomes a Web Standard handler, a CLI, a static report, an MCP server, or a hub dock.',
    full: {
      title: 'Devframe Documentation',
      description:
        'Complete Devframe documentation as plain markdown — guide, adapters, frameworks, helpers, plugins, references, and the error reference.',
    },
  },

  app: {
    head: {
      link: [
        { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/logo.svg' },
      ],
    },
  },
})
