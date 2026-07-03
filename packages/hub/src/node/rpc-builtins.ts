import type { RpcFunctionDefinitionAny } from 'devframe/rpc'
import type { DevframeMessageEntry, DevframeMessageEntryInput } from '../types/messages'
import type { DevframePtyTerminalSession } from '../types/terminals'
import { defineHubRpcFunction } from '../define'
import { diagnostics } from './diagnostics'

/**
 * Resolve an interactive (PTY) terminal session by id, or throw. Sessions
 * spawned via `startChildProcess` are output-only and are rejected here.
 */
function resolveInteractiveSession(
  sessions: Map<string, { id: string }>,
  id: string,
): DevframePtyTerminalSession {
  const session = sessions.get(id) as DevframePtyTerminalSession | undefined
  if (!session)
    throw diagnostics.DF8201({ id })
  if (typeof session.write !== 'function')
    throw diagnostics.DF8202({ id })
  return session
}

/**
 * `hub:commands:execute` — Invoke a registered server command by id. The
 * arguments after `id` are forwarded to the command's `handler(...)`.
 * Returns whatever the handler returns.
 *
 * Pairs with the `devframe:commands` shared state: clients read the list
 * from the shared state and dispatch by id via this RPC.
 */
export const hubCommandsExecute = defineHubRpcFunction({
  name: 'hub:commands:execute',
  type: 'action',
  setup: context => ({
    async handler(id: string, ...args: any[]) {
      return context.commands.execute(id, ...args)
    },
  }),
})

/**
 * `hub:messages:add` — Add a message from a browser client into the hub's
 * messages subsystem. Marked `from: 'browser'`. Returns the serializable
 * entry (the mutation handle stays server-side).
 *
 * Pairs with the client-side {@link import('../client').createDevframeClientHost}
 * context, whose `messages` client dispatches through these built-ins so a
 * dock client script can report into the same feed the server writes to.
 */
export const hubMessagesAdd = defineHubRpcFunction({
  name: 'hub:messages:add',
  type: 'action',
  jsonSerializable: true,
  setup: context => ({
    async handler(input: DevframeMessageEntryInput): Promise<DevframeMessageEntry> {
      const handle = await context.messages.add({ ...input, from: 'browser' } as DevframeMessageEntryInput)
      return handle.entry
    },
  }),
})

/** `hub:messages:update` — Patch a message by id; returns the updated entry (or `undefined`). */
export const hubMessagesUpdate = defineHubRpcFunction({
  name: 'hub:messages:update',
  type: 'action',
  jsonSerializable: true,
  setup: context => ({
    async handler(id: string, patch: Partial<DevframeMessageEntryInput>): Promise<DevframeMessageEntry | undefined> {
      return context.messages.update(id, patch)
    },
  }),
})

/** `hub:messages:remove` — Remove a message by id. */
export const hubMessagesRemove = defineHubRpcFunction({
  name: 'hub:messages:remove',
  type: 'action',
  setup: context => ({
    async handler(id: string): Promise<void> {
      await context.messages.remove(id)
    },
  }),
})

/** `hub:messages:clear` — Remove every message. */
export const hubMessagesClear = defineHubRpcFunction({
  name: 'hub:messages:clear',
  type: 'action',
  setup: context => ({
    async handler(): Promise<void> {
      await context.messages.clear()
    },
  }),
})

/**
 * `hub:terminals:write` — Send input to an interactive PTY session spawned
 * via `ctx.terminals.startPtySession`. Lets a hub-aware terminal UI (e.g. the
 * terminals plugin) drive a session owned by another plugin.
 */
export const hubTerminalsWrite = defineHubRpcFunction({
  name: 'hub:terminals:write',
  type: 'action',
  setup: context => ({
    async handler(id: string, data: string): Promise<void> {
      resolveInteractiveSession(context.terminals.sessions, id).write(data)
    },
  }),
})

/** `hub:terminals:resize` — Resize an interactive PTY session by id. */
export const hubTerminalsResize = defineHubRpcFunction({
  name: 'hub:terminals:resize',
  type: 'action',
  setup: context => ({
    async handler(id: string, cols: number, rows: number): Promise<void> {
      resolveInteractiveSession(context.terminals.sessions, id).resize(cols, rows)
    },
  }),
})

/**
 * Framework-neutral RPC declarations auto-registered by
 * {@link createHubContext}. Provide additional RPCs by passing your own
 * array via `CreateHubContextOptions.builtinRpcDeclarations`; the hub's
 * list is prepended automatically.
 */
export const builtinHubRpcDeclarations: readonly RpcFunctionDefinitionAny[] = [
  hubCommandsExecute,
  hubMessagesAdd,
  hubMessagesUpdate,
  hubMessagesRemove,
  hubMessagesClear,
  hubTerminalsWrite,
  hubTerminalsResize,
]
