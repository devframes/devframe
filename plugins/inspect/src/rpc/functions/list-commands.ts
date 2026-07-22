import type { DevframeInspectCommandInfo } from '../../types'
import { defineInspectRpc } from './_define'
import { projectCommand, resolveHubCommands } from './_hub-commands'

/**
 * Enumerate every command registered on the hub's commands host — id,
 * title, description, icon, category, whether it carries its own handler,
 * and nested children — when this connection is mounted inside a hub
 * (`@devframes/hub`). Returns an empty list on a plain devframe connection,
 * so the inspector's Commands tab degrades gracefully rather than erroring.
 * `snapshot: true` bakes the (possibly empty) list into the static dump so
 * the inspector still lists commands in `build`/`spa` mode.
 */
export const listCommands = defineInspectRpc({
  name: 'devframes:plugin:inspect:list-commands',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  agent: {
    description: 'List every command registered on the hub commands host (id, title, description, category, whether it has a handler, children), when this connection is mounted inside a hub. Read-only. Empty outside a hub.',
    title: 'List hub commands',
  },
  setup: ctx => ({
    handler: async (): Promise<DevframeInspectCommandInfo[]> => {
      const host = resolveHubCommands(ctx)
      if (!host)
        return []
      const out = [...host.commands.values()].map(projectCommand)
      out.sort((a, b) => a.title.localeCompare(b.title))
      return out
    },
  }),
})
