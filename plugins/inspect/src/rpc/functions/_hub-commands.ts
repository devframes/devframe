import type { DevframeInspectCommandInfo } from '../../types'

/**
 * Minimal shape of the hub's commands host (`DevframeHubContext.commands`,
 * `@devframes/hub/src/types/commands.ts`) that this plugin reads from.
 * Declared locally and accessed by duck-typing so the inspector keeps no
 * build/runtime dependency on `@devframes/hub` and degrades to an empty
 * list / a thrown diagnostic outside a hub.
 */
export interface HubCommandLike {
  id: string
  title: string
  description?: string
  icon?: string | { light: string, dark: string }
  category?: string
  handler?: (...args: any[]) => any
  children?: HubCommandLike[]
}

export interface HubCommandsHostLike {
  commands: Map<string, HubCommandLike>
  execute: (id: string, ...args: any[]) => Promise<unknown>
}

function looksLikeHubCommandsHost(value: unknown): value is HubCommandsHostLike {
  return !!value
    && typeof value === 'object'
    && (value as { commands?: unknown }).commands instanceof Map
    && typeof (value as { execute?: unknown }).execute === 'function'
}

/**
 * Resolve `ctx.commands` when this connection is mounted inside a hub, or
 * `undefined` on a plain devframe connection (CLI / Vite / build without a
 * hub). Structural rather than an `instanceof`/import check, matching the
 * pattern established in `plugins/terminals/src/node/manager.ts`.
 */
export function resolveHubCommands(ctx: object): HubCommandsHostLike | undefined {
  const commands = (ctx as { commands?: unknown }).commands
  return looksLikeHubCommandsHost(commands) ? commands : undefined
}

/**
 * Project a raw hub command (still carrying its `handler`) into the
 * serializable shape the inspector sends over RPC, recursing into
 * children. `hasHandler` survives the projection even though the hub's
 * own `commands.list()` strips `handler` entirely before it's callable
 * from here — reading the raw command straight off `host.commands`
 * preserves that flag.
 */
export function projectCommand(cmd: HubCommandLike): DevframeInspectCommandInfo {
  return {
    id: cmd.id,
    title: cmd.title,
    description: cmd.description,
    icon: cmd.icon,
    category: cmd.category,
    hasHandler: typeof cmd.handler === 'function',
    children: cmd.children?.map(projectCommand),
  }
}
