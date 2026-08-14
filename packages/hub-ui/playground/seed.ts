import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeDockEntryBase } from '@devframes/hub/types'

/**
 * A dock type no renderer covers — registering it exercises the viewer's
 * fallback view (`No renderer for "playground-unrendered" in the current
 * environment`) instead of leaving the dock bar empty. Mirrors
 * `examples/hub-vite/src/unrendered-dock.ts`.
 */
interface PlaygroundUnrenderedDockEntry extends DevframeDockEntryBase {
  type: 'playground-unrendered'
}

declare module '@devframes/hub/types' {
  interface DevframeDockEntryRegistry {
    'playground-unrendered': PlaygroundUnrenderedDockEntry
  }
}

const unrenderedDockEntry: PlaygroundUnrenderedDockEntry = {
  type: 'playground-unrendered',
  id: 'playground:unrendered',
  title: 'No Renderer',
  icon: 'ph:puzzle-piece-duotone',
  category: 'app',
}

/**
 * Seeds the playground's hub context with just enough content to exercise
 * hub-ui's own surfaces — the dock bar, message center, and command palette —
 * without needing a real mounted devframe SPA. Called from `hub-plugin.ts`'s
 * `configure` hook once the context exists.
 */
export async function seedPlayground(ctx: DevframeHubContext): Promise<void> {
  ctx.docks.register(unrenderedDockEntry)

  ctx.commands.register({
    id: 'playground:say-hello',
    title: 'Playground · Say Hello',
    icon: 'ph:hand-waving-duotone',
    category: 'playground',
    handler: () => 'Hello from the hub-ui playground!',
  })
  ctx.commands.register({
    id: 'playground:throw',
    title: 'Playground · Throw an Error',
    icon: 'ph:bomb-duotone',
    category: 'playground',
    handler: () => {
      throw new Error('Deliberate playground error — exercises the command palette\'s failure toast.')
    },
  })

  await ctx.messages.add({
    level: 'info',
    message: 'Hub UI playground started',
    description: 'Editing anything under packages/hub-ui/src/client hot-reloads this page.',
  })
  await ctx.messages.add({
    level: 'success',
    message: 'Sample success message',
  })
  await ctx.messages.add({
    level: 'warn',
    message: 'Sample warning message',
    description: 'Messages support an optional description line like this one.',
  })
  await ctx.messages.add({
    level: 'error',
    message: 'Sample error message',
  })
}
