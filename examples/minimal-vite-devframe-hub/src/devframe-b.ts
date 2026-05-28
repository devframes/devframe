import type { DevframeHubContext } from '@devframes/hub/node'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'

export default defineDevframe({
  id: 'demo-tool-b',
  name: 'Demo Tool B',
  icon: 'ph:wrench-duotone',
  basePath: '/__demo-tool-b/',
  cli: {
    distDir: fileURLToPath(new URL('../spa/demo-tool-b/', import.meta.url)),
  },
  async setup(rawCtx) {
    const ctx = rawCtx as unknown as DevframeHubContext

    ctx.commands.register({
      id: 'demo-tool-b:say-hello',
      title: 'Demo B · Say Hello',
      icon: 'ph:hand-waving-duotone',
      category: 'demo',
      handler: () => 'Hello from demo-tool-b!',
    })

    await ctx.messages.add({
      level: 'info',
      message: 'Second demo devframe loaded',
      description: 'A second mountDevframe() call — proves the switcher has more than one option.',
    })
  },
})
