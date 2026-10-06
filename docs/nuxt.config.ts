import process from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-21',

  /**
   * Develop against a local checkout of the layer:
   * COMARK_DOCS_LAYER=../../comark-docs pnpm docs
   */
  extends: [process.env.COMARK_DOCS_LAYER || 'comark-docs'],

  css: [
    '@shikijs/magic-move/style.css',
    '~/assets/css/devframe.css',
  ],

  site: {
    url: 'https://devfra.me',
    name: 'Devframe',
  },

  llms: {
    domain: 'https://devfra.me',
    title: 'Devframe',
    description:
      'Framework-neutral foundation for building devtools: one definition becomes a Web Standard handler, a CLI, a static report, an MCP server, or a hub dock.',
    full: {
      title: 'Devframe Documentation',
      description:
        'Complete Devframe documentation as plain markdown: guide, adapters, frameworks, add-ons, references, and the error reference.',
    },
  },

  // Dev only: production builds never resolve the hub or its devframes.
  // Factories defer the plugin imports, so `docs:build` needs no built workspace packages.
  $development: {
    modules: [['@devframes/nuxt/hub', {
      quiet: true,
      devframes: [
        () => import('@devframes/plugin-a11y').then(m => m.createA11yDevframe()),
        () => import('@devframes/plugin-og').then(m => m.createOgDevframe({ defaultUrl: 'http://localhost:5175' })),
      ],
    }]],
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
