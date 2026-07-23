import type { DevframeHubContext } from '@devframes/hub/node'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { dirname, resolve } from 'pathe'
import pkg from '../../../package.json' with { type: 'json' }

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * A demo of **shared-iframe soft navigation**. This devframe is a single SPA
 * with several internal views (Overview / Components / Timeline / Settings).
 * Mounted as a `subTabs` anchor (see `minimal-next-devframe-hub.ts`), the hub's
 * client host attaches its frame-nav adapter: the SPA's `postMessage` shim
 * reports its tabs, each becomes a client-only hub dock sharing this one iframe,
 * and switching docks soft-navigates inside it instead of reloading.
 */
export default defineDevframe({
  id: 'next-tabbed-tool',
  name: 'Next Tabbed Tool',
  version: pkg.version,
  packageName: pkg.name,
  homepage: pkg.homepage,
  description: 'A multi-view SPA hosted as shared-iframe hub docks with soft navigation.',
  icon: 'ph:squares-four-duotone',
  basePath: '/__next-tabbed-tool/',
  cli: {
    distDir: resolve(HERE, '../../../spa/next-tabbed-tool'),
  },
  async setup(rawCtx) {
    const ctx = rawCtx as unknown as DevframeHubContext
    await ctx.messages.add({
      level: 'info',
      message: 'Next Tabbed Tool mounted as a shared-iframe anchor',
      description: 'Its tabs surface as client-only docks that soft-navigate one iframe.',
    })
  },
})
