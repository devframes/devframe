import type { DevframeViewAction, DevframeViewGroup } from '@devframes/hub'
import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeDockEntryBase } from '@devframes/hub/types'
import { PLAYGROUND_GROUP_ID } from './constants'

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
 * The dock-bar button collapsing the Git devframe (grouped by
 * `hub-plugin.ts`'s `devframes` entry) and the "Ping" action below —
 * exercises the grouped-dock UI (`DockGroupButton`/`DockGroupPopover`) the
 * playground otherwise never touches.
 */
const playgroundGroup: DevframeViewGroup = {
  type: 'group',
  id: PLAYGROUND_GROUP_ID,
  title: 'Playground Tools',
  icon: 'ph:flask-duotone',
  category: 'app',
  // No `defaultChildId` — clicking reveals the member popover instead of
  // jumping straight to one, exercising that UI too (`DockGroupPopover`).
}

/**
 * A one-shot action dock — no panel of its own, just a client script
 * (`client-scripts/ping-action.ts`) the viewer imports and runs on click.
 * Grouped alongside the Git devframe above.
 */
const pingAction: DevframeViewAction = {
  type: 'action',
  id: 'playground:ping',
  title: 'Ping',
  icon: 'ph:hand-waving-duotone',
  category: 'app',
  groupId: PLAYGROUND_GROUP_ID,
  action: { importFrom: '/client-scripts/ping-action.ts' },
}

/**
 * Seeds the playground's hub context with just enough content to exercise
 * hub-ui's own surfaces — the dock bar, message center, and command palette —
 * without needing a real mounted devframe SPA. Called from `hub-plugin.ts`'s
 * `configure` hook once the context exists.
 */
export async function seedPlayground(ctx: DevframeHubContext): Promise<void> {
  ctx.docks.register(unrenderedDockEntry)
  ctx.docks.register(playgroundGroup)
  ctx.docks.register(pingAction)

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
