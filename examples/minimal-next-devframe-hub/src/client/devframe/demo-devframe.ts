import type { DevframeHubContext } from '@devframes/hub/node'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { dirname, resolve } from 'pathe'
import pkg from '../../../package.json' with { type: 'json' }

const HERE = dirname(fileURLToPath(import.meta.url))

export default defineDevframe({
  id: 'next-demo-tool',
  name: 'Next Demo Tool',
  version: pkg.version,
  packageName: pkg.name,
  homepage: pkg.homepage,
  description: 'A tiny demo devframe mounted into the Next.js hub via mountDevframe().',
  icon: 'ph:rocket-duotone',
  basePath: '/__next-demo-tool/',
  cli: {
    distDir: resolve(HERE, '../../../spa/next-demo-tool'),
  },
  async setup(rawCtx) {
    const ctx = rawCtx as unknown as DevframeHubContext

    ctx.commands.register({
      id: 'next-demo-tool:say-hello',
      title: 'Next Demo Tool: Say Hello',
      icon: 'ph:hand-waving-duotone',
      category: 'demo',
      handler: () => 'Hello from the Next demo command!',
    })

    await ctx.messages.add({
      level: 'info',
      message: 'Next demo devframe loaded',
      description: 'Registered via mountDevframe() from the Next host.',
    })
  },
})
