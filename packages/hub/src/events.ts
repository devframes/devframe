/**
 * Centralized registry of every event, broadcast, RPC method, shared-state
 * key, and channel name the hub uses — the single source of truth that keeps
 * these names out of scattered string literals.
 *
 * **Keep this in sync with [`docs/content/1.guide/20.events.md`](../../../docs/content/1.guide/20.events.md)**
 * (the Hub Events Reference): every name here appears in that page's tables, and
 * every name there resolves to an entry here. Add, rename, or remove a name in
 * both places in the same change, and reference `HUB_EVENTS.*` from call sites
 * instead of re-typing a literal.
 *
 * The `.events` EventEmitter maps in `types/{docks,terminals,messages,commands}.ts`
 * and the RPC augmentation interfaces in `node/context.ts` declare these same
 * names as type-level keys (a literal is unavoidable in a type position); those
 * declarations mirror this map and move with it.
 */
export const HUB_EVENTS = {
  /**
   * Internal node `EventEmitter` events on `ctx.<subsystem>.events`. Emitted
   * and consumed inside the node process (chiefly by `createHubContext`, which
   * fans them out onto the wire); they never cross to the browser.
   */
  bus: {
    docksEntryUpdated: 'docks:entry:updated',
    docksActivate: 'docks:activate',
    docksPanelState: 'docks:panel:state',
    terminalsSessionUpdated: 'terminals:session:updated',
    messagesAdded: 'messages:added',
    messagesUpdated: 'messages:updated',
    messagesRemoved: 'messages:removed',
    messagesCleared: 'messages:cleared',
    commandsRegistered: 'commands:registered',
    commandsUnregistered: 'commands:unregistered',
  },
  /** Server RPC methods a connected client calls (client → server), `hub:` prefix. */
  rpc: {
    docksActivate: 'hub:docks:activate',
    docksPanelState: 'hub:docks:panel-state',
    commandsExecute: 'hub:commands:execute',
    messagesAdd: 'hub:messages:add',
    messagesUpdate: 'hub:messages:update',
    messagesRemove: 'hub:messages:remove',
    messagesClear: 'hub:messages:clear',
    terminalsWrite: 'hub:terminals:write',
    terminalsResize: 'hub:terminals:resize',
    terminalsTerminate: 'hub:terminals:terminate',
    terminalsRestart: 'hub:terminals:restart',
    terminalsRemove: 'hub:terminals:remove',
  },
  /** Broadcast notifications the server pushes to clients (server → client), `devframe:` prefix. */
  broadcast: {
    docksActivate: 'devframe:docks:activate',
    terminalsUpdated: 'devframe:terminals:updated',
    messagesUpdated: 'devframe:messages:updated',
  },
  /** Shared-state slot keys a hub-aware client reads (server → client), `devframe:` prefix. */
  sharedState: {
    docks: 'devframe:docks',
    docksActive: 'devframe:docks:active',
    commands: 'devframe:commands',
    userSettings: 'devframe:user-settings',
    dockRenderers: 'devframe:dock-renderers',
  },
  /** Streaming channel ids (server → client), `devframe:` prefix. */
  stream: {
    terminals: 'devframe:terminals',
  },
  /** `postMessage` channels for host ↔ iframe protocols, `devframe:` prefix. */
  postMessage: {
    frameNav: 'devframe:frame-nav',
  },
} as const
