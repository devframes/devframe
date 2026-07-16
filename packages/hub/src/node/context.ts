import type { CreateHostContextOptions } from 'devframe/node'
import type { DevframeHost, DevframeNodeContext } from 'devframe/types'
import type { DevframeCommandsHost } from '../types/commands'
import type { DevframeDockActivation, DevframeDocksActiveState, DevframeDocksHost } from '../types/docks'
import type { JsonRenderer, JsonRenderSpec } from '../types/json-render'
import type { DevframeMessagesHost } from '../types/messages'
import type { DevframeTerminalsHost } from '../types/terminals'
import { createHostContext } from 'devframe/node'
import { debounce } from 'perfect-debounce'
import { DevframeCommandsHost as CommandsHostImpl } from './host-commands'
import { DevframeDocksHost as DocksHostImpl } from './host-docks'
import { DevframeMessagesHost as MessagesHostImpl } from './host-messages'
import { DevframeTerminalsHost as TerminalsHostImpl } from './host-terminals'
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
}

/**
 * Hub-augmented node context — extends devframe's framework-neutral
 * `DevframeNodeContext` with the hub-level subsystems (`docks`,
 * `terminals`, `messages`, `commands`) and the `createJsonRenderer`
 * factory.
 *
 * Framework kits further extend this with their own slots (e.g.
 * `viteConfig`, `viteServer`). Host-specific capabilities (editor open,
 * filesystem reveal, etc.) ship as kit-registered RPC functions rather
 * than as part of this surface.
 */
export interface DevframeHubContext extends DevframeNodeContext {
  readonly host: DevframeHost
  docks: DevframeDocksHost
  terminals: DevframeTerminalsHost
  messages: DevframeMessagesHost
  commands: DevframeCommandsHost
  /**
   * Create a JsonRenderer handle for building json-render powered UIs.
   */
  createJsonRenderer: (spec: JsonRenderSpec) => JsonRenderer
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

  await docks.init()

  let jrCounter = 0
  context.createJsonRenderer = (initialSpec: JsonRenderSpec): JsonRenderer => {
    const stateKey = `devframe:json-render:${jrCounter++}`
    const statePromise = context.rpc.sharedState.get(stateKey as any, {
      initialValue: initialSpec as any,
    })

    return {
      _stateKey: stateKey,
      async updateSpec(spec) {
        const state = await statePromise
        state.mutate(() => spec as any)
      },
      async updateState(newState) {
        const state = await statePromise
        state.mutate((draft: any) => {
          draft.state = { ...draft.state, ...newState }
        })
      },
    }
  }

  const debounceMs = options.mode === 'build' ? 0 : 10

  const docksSharedState = await context.rpc.sharedState.get('devframe:docks', { initialValue: [] })
  const refreshDocks = debounce(() => {
    docksSharedState.mutate(() => docks.values())
  }, debounceMs)
  docks.events.on('dock:entry:updated', refreshDocks)
  docksSharedState.mutate(() => docks.values())

  // Cross-iframe dock activation. A dock activation is a discrete user intent
  // ("go to Terminals now"), so it fires immediately (no debounce, which could
  // coalesce two distinct requests) both as a live broadcast — the host shell
  // switches its active dock — and into a shared-state slot, so a dock that
  // only mounts *because* of the switch still converges on the request.
  const activeDockSharedState = await context.rpc.sharedState.get<DevframeDocksActiveState>(
    'devframe:docks:active',
    { initialValue: { activation: null } },
  )
  docks.events.on('dock:activate', (activation) => {
    activeDockSharedState.mutate((state) => {
      state.activation = activation
    })
    context.rpc.broadcast({
      method: 'devframe:docks:activate',
      args: [activation],
    })
  })

  const broadcastTerminals = debounce(() => {
    context.rpc.broadcast({
      method: 'devframe:terminals:updated',
      args: [],
    })
    docksSharedState.mutate(() => docks.values())
  }, debounceMs)
  terminals.events.on('terminal:session:updated', broadcastTerminals)

  const broadcastMessages = debounce(() => {
    context.rpc.broadcast({
      method: 'devframe:messages:updated',
      args: [],
    })
    docksSharedState.mutate(() => docks.values())
  }, debounceMs)
  messages.events.on('message:added', broadcastMessages)
  messages.events.on('message:updated', broadcastMessages)
  messages.events.on('message:removed', broadcastMessages)
  messages.events.on('message:cleared', broadcastMessages)

  const commandsSharedState = await context.rpc.sharedState.get('devframe:commands', { initialValue: [] })
  const syncCommands = debounce(() => {
    commandsSharedState.mutate(() => commands.list())
  }, debounceMs)
  commands.events.on('command:registered', syncCommands)
  commands.events.on('command:unregistered', syncCommands)

  commandsSharedState.mutate(() => commands.list())

  return context
}
