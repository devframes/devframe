import type { DevframeHubContext } from '@devframes/hub/node'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import pkg from '../package.json' with { type: 'json' }

/**
 * A demo of **shared-iframe soft navigation**. This devframe is a single SPA
 * with several internal views (Overview / Components / Timeline / Settings).
 * Mounted as a `subTabs` anchor (see `vite.config.ts`), the hub's client host
 * attaches its frame-nav adapter: the SPA's `postMessage` shim reports its tabs,
 * each becomes a client-only hub dock sharing this one iframe, and switching
 * docks soft-navigates inside it instead of reloading — a unified home for a
 * multi-tab tool like Nuxt DevTools.
 */
export default defineDevframe({
  id: 'tabbed-tool',
  name: 'Tabbed Tool',
  version: pkg.version,
  packageName: pkg.name,
  homepage: pkg.homepage,
  description: 'A multi-view SPA hosted as shared-iframe hub docks with soft navigation.',
  icon: 'ph:squares-four-duotone',
  basePath: '/__tabbed-tool/',
  cli: {
    distDir: fileURLToPath(new URL('../spa/tabbed-tool/', import.meta.url)),
  },
  async setup(rawCtx) {
    const ctx = rawCtx as unknown as DevframeHubContext
    await ctx.messages.add({
      level: 'info',
      message: 'Tabbed Tool mounted as a shared-iframe anchor',
      description: 'Its tabs surface as client-only docks that soft-navigate one iframe.',
    })
  },
})
