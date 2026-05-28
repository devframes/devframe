import type { DevframeHubContext } from '@devframes/hub/node'
import { fileURLToPath } from 'node:url'
import { defineDevframe } from 'devframe/types'

/**
 * A tiny demo devframe — proves a portable devframe can plug into the
 * hub via {@link mountDevframe} and register its own docks / commands /
 * messages on top of the host-provided subsystems.
 *
 * The `ctx` cast is the same one `@vitejs/devtools-kit`'s
 * `createPluginFromDevframe` does today; the kit-level mount primitive
 * threads a hub-augmented context through `d.setup`.
 */
export default defineDevframe({
  id: 'demo-tool',
  name: 'Demo Tool',
  icon: 'ph:rocket-duotone',
  basePath: '/__demo-tool/',
  cli: {
    distDir: fileURLToPath(new URL('../spa/demo-tool/', import.meta.url)),
  },
  async setup(rawCtx) {
    const ctx = rawCtx as unknown as DevframeHubContext

    ctx.commands.register({
      id: 'demo-tool:say-hello',
      title: 'Demo · Say Hello',
      icon: 'ph:hand-waving-duotone',
      category: 'demo',
      handler: () => 'Hello from the demo command!',
    })

    await ctx.messages.add({
      level: 'info',
      message: 'Demo devframe loaded',
      description: 'Registered via mountDevframe(). Proves the devframe ↔ hub plug-in path works.',
    })
  },
})
