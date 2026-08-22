import type { CreateHostContextOptions } from 'devframe/node'
import type { DevframeDefinition, DevframeHost, DevframeNodeContext } from 'devframe/types'
import type { DevframeCommandsHost } from '../types/commands'
import type { DevframeDockActivation, DevframeDocksActiveState, DevframeDocksHost } from '../types/docks'
import type { DevframeMessageEntry, DevframeMessageEntryInput, DevframeMessagesHost } from '../types/messages'
import type { DevframeTerminalsHost } from '../types/terminals'
import type { InstallDevframeOptions } from './install-devframe'
import { createHostContext } from 'devframe/node'
import { getInternalContext } from 'devframe/node/hub-internals'
import { debounce } from 'perfect-debounce'
import { HUB_EVENTS } from '../events'
import { DevframeCommandsHost as CommandsHostImpl } from './host-commands'
import { DevframeDocksHost as DocksHostImpl } from './host-docks'
import { DevframeMessagesHost as MessagesHostImpl } from './host-messages'
import { DevframeTerminalsHost as TerminalsHostImpl } from './host-terminals'
import { installDevframe } from './install-devframe'
import { builtinHubRpcDeclarations } from './rpc-builtins'

declare module 'devframe/types' {
  interface DevframeRpcClientFunctions {
    /**
     * Server→client request to switch the active dock. Broadcast by the hub
     * context in response to `ctx.docks.activate()` (driven by the
     * `hub:docks:activate` RPC). The client host registers a handler that
     * calls its local `switchEntry(dockId)`; the target dock reads
     * `activation.params` to react (e.g. focus a session). Do not register
     * manually.
     *
     * @internal
     */
    'devframe:docks:activate': (activation: DevframeDockActivation) => Promise<void>
    /**
     * Server→client notification that terminal sessions changed. Broadcast
     * by the hub context; a hub-aware client re-reads terminal state in
     * response. Do not register manually.
     *
     * @internal
     */
    'devframe:terminals:updated': () => Promise<void>
    /**
     * Server→client notification that the message list changed. Broadcast
     * by the hub context; a hub-aware client re-reads message state in
     * response. Do not register manually.
     *
     * @internal
     */
    'devframe:messages:updated': () => Promise<void>
  }

  interface DevframeRpcServerFunctions {
    /**
     * Ask the active viewer to switch its focused dock to `dockId`, optionally
     * carrying `params` for the target dock to interpret (e.g.
     * `{ sessionId }` for the terminals dock). Any connected client may call
     * it — a mounted devframe in its own iframe steers the host shell's dock
     * selection. Handled by {@link import('./rpc-builtins').hubDocksActivate}.
     */
    'hub:docks:activate': (input: { dockId: string, params?: Record<string, unknown> }) => Promise<void>
    /**
     * Report this viewer connection's current dock-panel state. The server
     * resolves the connection's session id and emits the typed lifecycle event
     * on `ctx.docks.events`.
     *
     * Use `reportDockPanelState()` from `@devframes/hub/client`.
     *
     * @internal
     */
    'hub:docks:panel:state': (open: boolean) => Promise<void>
    /**
     * Invoke a registered server command by id; trailing args are forwarded to
     * the command's handler. Handled by
     * {@link import('./rpc-builtins').hubCommandsExecute}.
     */
    'hub:commands:execute': (id: string, ...args: any[]) => Promise<unknown>
    /**
     * Add a message from a browser client into the hub's messages feed
     * (marked `from: 'browser'`); returns the serializable entry. Handled by
     * {@link import('./rpc-builtins').hubMessagesAdd}.
     */
    'hub:messages:add': (input: DevframeMessageEntryInput) => Promise<DevframeMessageEntry>
    /** Patch a message by id; resolves the updated entry (or `undefined`). */
    'hub:messages:update': (id: string, patch: Partial<DevframeMessageEntryInput>) => Promise<DevframeMessageEntry | undefined>
    /** Remove a message by id. */
    'hub:messages:remove': (id: string) => Promise<void>
    /** Remove every message. */
    'hub:messages:clear': () => Promise<void>
    /**
     * Send input to an interactive PTY session spawned via
     * `ctx.terminals.startPtySession`. Handled by
     * {@link import('./rpc-builtins').hubTerminalsWrite}.
     */
    'hub:terminals:write': (id: string, data: string) => Promise<void>
    /** Resize an interactive PTY session by id. */
    'hub:terminals:resize': (id: string, cols: number, rows: number) => Promise<void>
  }
}

/**
 * Hub-augmented node context — extends devframe's framework-neutral
 * `DevframeNodeContext` with the hub-level subsystems (`docks`,
 * `terminals`, `messages`, `commands`).
 *
 * Framework kits further extend this with their own slots (e.g.
 * `viteConfig`, `viteServer`). Host-specific capabilities (editor open,
 * filesystem reveal, etc.) ship as kit-registered RPC functions rather
 * than as part of this surface. JSON-render is an opt-in integration
 * (`@devframes/json-render`) that augments any devframe context and
 * contributes its own dock type — use `createJsonRenderView` from
 * `@devframes/json-render/node`.
 */
export interface DevframeHubContext extends DevframeNodeContext {
  readonly host: DevframeHost
  docks: DevframeDocksHost
  terminals: DevframeTerminalsHost
  messages: DevframeMessagesHost
  commands: DevframeCommandsHost
  /**
   * Install a {@link DevframeDefinition} into this hub: serve its SPA at the
   * resolved base, synthesize an iframe dock from its metadata, and run its
   * `setup(ctx)`. The imperative counterpart to `initHub`'s declarative
   * `devframes` list — call it from a hub host's `configure(ctx)`, or wherever
   * you hold the context, to plug an extra devframe in.
   */
  install: (devframe: DevframeDefinition, options?: InstallDevframeOptions) => Promise<void>
}

/**
 * Options for {@link createHubContext} — devframe's
 * {@link CreateHostContextOptions} plus any hub-level additions kits layer on
 * through declaration merging.
 */
export interface CreateHubContextOptions extends CreateHostContextOptions {}

/**
 * Create a hub-level node context: wraps devframe's `createHostContext`,
 * attaches the hub hosts (`docks`, `terminals`, `messages`, `commands`),
 * registers the hub's built-in RPC commands, and wires the shared-state
 * synchronization that powers a hub-aware client UI.
 */
export async function createHubContext(options: CreateHubContextOptions): Promise<DevframeHubContext> {
  const baseContext = await createHostContext({
    ...options,
    builtinRpcDeclarations: [
      ...builtinHubRpcDeclarations,
      ...(options.builtinRpcDeclarations ?? []),
    ],
  })
  const context = baseContext as DevframeHubContext

  const docks = new DocksHostImpl(context)
  const terminals = new TerminalsHostImpl(context)
  const messages = new MessagesHostImpl(context)
  const commands = new CommandsHostImpl(context)

  context.docks = docks
  context.terminals = terminals
  context.messages = messages
  context.commands = commands
  context.install = (devframe, options) => installDevframe(context, devframe, options)

  await docks.init()

  const debounceMs = options.mode === 'build' ? 0 : 10

  const docksSharedState = await context.rpc.sharedState.get(HUB_EVENTS.sharedState.docks, { initialValue: [] })
  const refreshDocks = debounce(() => {
    docksSharedState.mutate(() => docks.values())
  }, debounceMs)
  docks.events.on(HUB_EVENTS.bus.docksEntryUpdated, refreshDocks)
  // A remote iframe dock registered before the WS transport finishes binding
  // (the common case: `initHub` installs devframes — and their docks — before
  // resolving an async side-car/shared-server port) gets projected without a
  // connection URL, since `wsEndpoint` isn't set yet. Nothing re-registers
  // that dock once the port resolves, so re-project every dock once the
  // endpoint becomes known (or is torn down) instead of leaving it stale.
  getInternalContext(context).onWsEndpointChange(refreshDocks)
  docksSharedState.mutate(() => docks.values())

  // Cross-iframe dock activation. A dock activation is a discrete user intent
  // ("go to Terminals now"), so it fires immediately (no debounce, which could
  // coalesce two distinct requests) both as a live broadcast — the host shell
  // switches its active dock — and into a shared-state slot, so a dock that
  // only mounts *because* of the switch still converges on the request.
  const activeDockSharedState = await context.rpc.sharedState.get<DevframeDocksActiveState>(
    HUB_EVENTS.sharedState.docksActive,
    { initialValue: { activation: null } },
  )
  docks.events.on(HUB_EVENTS.bus.docksActivate, (activation) => {
    activeDockSharedState.mutate((state) => {
      state.activation = activation
    })
    context.rpc.broadcast({
      method: HUB_EVENTS.broadcast.docksActivate,
      args: [activation],
    })
  })

  const broadcastTerminals = debounce(() => {
    context.rpc.broadcast({
      method: HUB_EVENTS.broadcast.terminalsUpdated,
      args: [],
    })
    docksSharedState.mutate(() => docks.values())
  }, debounceMs)
  terminals.events.on(HUB_EVENTS.bus.terminalsSessionUpdated, broadcastTerminals)

  const broadcastMessages = debounce(() => {
    context.rpc.broadcast({
      method: HUB_EVENTS.broadcast.messagesUpdated,
      args: [],
    })
    docksSharedState.mutate(() => docks.values())
  }, debounceMs)
  messages.events.on(HUB_EVENTS.bus.messagesAdded, broadcastMessages)
  messages.events.on(HUB_EVENTS.bus.messagesUpdated, broadcastMessages)
  messages.events.on(HUB_EVENTS.bus.messagesRemoved, broadcastMessages)
  messages.events.on(HUB_EVENTS.bus.messagesCleared, broadcastMessages)

  const commandsSharedState = await context.rpc.sharedState.get(HUB_EVENTS.sharedState.commands, { initialValue: [] })
  const syncCommands = debounce(() => {
    commandsSharedState.mutate(() => commands.list())
  }, debounceMs)
  commands.events.on(HUB_EVENTS.bus.commandsRegistered, syncCommands)
  commands.events.on(HUB_EVENTS.bus.commandsUnregistered, syncCommands)

  commandsSharedState.mutate(() => commands.list())

  return context
}
