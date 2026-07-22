import type { RpcFunctionDefinitionAny } from 'devframe/rpc'
import type { DevframeMessageEntry, DevframeMessageEntryInput } from '../types/messages'
import type {
  DevframeChildProcessTerminalSession,
  DevframePtyTerminalSession,
} from '../types/terminals'
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

/** A session exposing lifecycle handles — spawned via startChildProcess/startPtySession. */
type ControllableTerminalSession = DevframeChildProcessTerminalSession | DevframePtyTerminalSession

/**
 * Resolve a session that can be terminated/restarted (spawned via
 * `startChildProcess` or `startPtySession`), or throw. Sessions added with a
 * bare `register()` carry no lifecycle handle and are rejected.
 */
function resolveControllableSession(
  sessions: Map<string, { id: string }>,
  id: string,
): ControllableTerminalSession {
  const session = sessions.get(id) as ControllableTerminalSession | undefined
  if (!session)
    throw diagnostics.DF8201({ id })
  if (typeof session.terminate !== 'function')
    throw diagnostics.DF8204({ id })
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
 * `hub:terminals:terminate` — Kill a session's process while keeping the
 * session registered (its output/scrollback stays). Works for both read-only
 * child-process and interactive PTY sessions, letting a hub-aware terminal UI
 * force-kill a session owned by another plugin.
 */
export const hubTerminalsTerminate = defineHubRpcFunction({
  name: 'hub:terminals:terminate',
  type: 'action',
  setup: context => ({
    async handler(id: string): Promise<void> {
      await resolveControllableSession(context.terminals.sessions, id).terminate()
    },
  }),
})

/**
 * `hub:terminals:restart` — Re-run a session's command in place. Rejected for
 * sessions registered with `restartable: false`, whose lifecycle is owned
 * elsewhere.
 */
export const hubTerminalsRestart = defineHubRpcFunction({
  name: 'hub:terminals:restart',
  type: 'action',
  setup: context => ({
    async handler(id: string): Promise<void> {
      const session = resolveControllableSession(context.terminals.sessions, id)
      if (session.restartable === false)
        throw diagnostics.DF8205({ id })
      await session.restart()
    },
  }),
})

/**
 * `hub:terminals:remove` — Kill a session's process (when it still owns one)
 * and drop it from the registry, disposing its output stream. Lets a hub-aware
 * terminal UI discard a stopped aggregated session.
 */
export const hubTerminalsRemove = defineHubRpcFunction({
  name: 'hub:terminals:remove',
  type: 'action',
  setup: context => ({
    async handler(id: string): Promise<void> {
      const session = context.terminals.sessions.get(id)
      if (!session)
        throw diagnostics.DF8201({ id })
      const controllable = session as Partial<ControllableTerminalSession>
      if (typeof controllable.terminate === 'function')
        await controllable.terminate()
      context.terminals.remove(session)
    },
  }),
})

/**
 * `hub:docks:activate` — Ask the active viewer to switch its focused dock to
 * `dockId`, optionally carrying `params` for the target dock to interpret
 * (e.g. `{ sessionId }` for the terminals dock to focus a session).
 *
 * Any connected client may call it, which is the point: a mounted devframe
 * running in its own iframe (on its own RPC client) can steer the host shell's
 * dock selection — client-local state it otherwise can't reach. The hub
 * broadcasts the request live to connected clients (the host shell switches)
 * and mirrors it into the `devframe:docks:active` shared state (a dock that
 * mounts in response still converges on it).
 */
export const hubDocksActivate = defineHubRpcFunction({
  name: 'hub:docks:activate',
  type: 'action',
  setup: context => ({
    async handler(input: { dockId: string, params?: Record<string, unknown> }): Promise<void> {
      context.docks.activate(input.dockId, input.params)
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
  hubDocksActivate,
  hubMessagesAdd,
  hubMessagesUpdate,
  hubMessagesRemove,
  hubMessagesClear,
  hubTerminalsWrite,
  hubTerminalsResize,
  hubTerminalsTerminate,
  hubTerminalsRestart,
  hubTerminalsRemove,
]
