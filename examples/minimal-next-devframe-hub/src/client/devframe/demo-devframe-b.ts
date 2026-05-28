import type { DevframeHubContext } from '@devframes/hub/node'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'
import { dirname, resolve } from 'pathe'

const HERE = dirname(fileURLToPath(import.meta.url))

export default defineDevframe({
  id: 'next-demo-tool-b',
  name: 'Next Demo Tool B',
  icon: 'ph:wrench-duotone',
  basePath: '/__next-demo-tool-b/',
  cli: {
    distDir: resolve(HERE, '../../../spa/next-demo-tool-b'),
  },
  async setup(rawCtx) {
    const ctx = rawCtx as unknown as DevframeHubContext

    ctx.commands.register({
      id: 'next-demo-tool-b:say-hello',
      title: 'Next Demo Tool B: Say Hello',
      icon: 'ph:hand-waving-duotone',
      category: 'demo',
      handler: () => 'Hello from next-demo-tool-b!',
    })

    await ctx.messages.add({
      level: 'info',
      message: 'Second Next demo devframe loaded',
      description: 'A second mountDevframe() call — proves the switcher has more than one option.',
    })
  },
})
