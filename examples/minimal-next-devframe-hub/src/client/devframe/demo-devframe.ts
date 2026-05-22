import type { HubNodeContext } from '@devframes/hub/node'
import { defineDevframe } from 'devframe/types'

export default defineDevframe({
  id: 'next-demo-tool',
  name: 'Next Demo Tool',
  icon: 'ph:rocket-duotone',
  basePath: '/__next-demo-tool/',
  async setup(rawCtx) {
    const ctx = rawCtx as unknown as HubNodeContext

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
