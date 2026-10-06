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

  // Dev only: mount the devframes into Nuxt DevTools. The imports are lazy,
  // so `docs:build` needs no built workspace packages.
  $development: {
    // DevTools v4 sets `noExternals` to an array when it is unset. Nitro 2 reads
    // any truthy value as "inline everything" and fails on `playwright-core`.
    nitro: { noExternals: false },
    modules: [
      async () => {
        const [{ onDevtoolsReady }, { createA11yDevframe }, { createOgDevframe }] = await Promise.all([
          import('@nuxt/devtools-kit'),
          import('@devframes/plugin-a11y'),
          import('@devframes/plugin-og'),
        ])
        onDevtoolsReady(async (kit) => {
          await kit.install(createA11yDevframe())
          await kit.install(createOgDevframe({ defaultUrl: 'http://localhost:5175' }))
        })
      },
    ],
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
