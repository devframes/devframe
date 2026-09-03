/**
 * Centralized registry of the core devframe event names: the node-side host
 * bus events, the client RPC connection events, and the server→client
 * broadcast notifications, so these names live in one place instead of
 * scattered string literals.
 *
 * **Keep this in sync with [`docs/content/8.references/3.events.md`](../../../docs/content/8.references/3.events.md)**
 * (the "Core devframe events" section): every name here appears in that page's
 * tables, and every name there resolves to an entry here. Add, rename, or
 * remove a name in both places in the same change, and reference
 * `DEVFRAME_EVENTS.*` from call sites instead of re-typing a literal.
 *
 * This map covers **notifications** (events, broadcasts). The request/response
 * RPC endpoints of the shared-state, streaming, and auth-handshake protocols
 * (`devframe:rpc:server-state:*`, `devframe:streaming:subscribe`,
 * `anonymous:devframe:auth`, …) are defined at their handlers and typed in
 * `types/rpc-augments.ts`; they aren't events and stay out of this map.
 *
 * The `EventEmitter` maps (`RpcClientEvents`, `DevframeAgentHostEvents`) and the
 * `DevframeRpcClientFunctions` augmentation declare these names as type-level
 * keys (a literal is unavoidable in a type position); those declarations mirror
 * this map and move with it.
 */
export const DEVFRAME_EVENTS = {
  /**
   * Node-side host `EventEmitter` events. The agent host (`ctx.agent.events`)
   * emits these as its tool/resource surface changes; protocol adapters (e.g.
   * MCP) subscribe to re-publish their manifest.
   */
  bus: {
    agentManifestChanged: 'agent:manifest:changed',
    agentToolRegistered: 'agent:tool:registered',
    agentToolUnregistered: 'agent:tool:unregistered',
    agentResourceRegistered: 'agent:resource:registered',
    agentResourceUnregistered: 'agent:resource:unregistered',
  },
  /**
   * Client-side RPC connection `EventEmitter` events (`rpc.events`) a UI
   * subscribes to for connection lifecycle and error surfacing.
   */
  client: {
    isTrustedUpdated: 'rpc:is-trusted:updated',
    error: 'rpc:error',
    connectionStatus: 'connection:status',
    connectionError: 'connection:error',
  },
  /**
   * Broadcast notifications the server pushes to clients (server → client),
   * `devframe:` prefix. The paired request methods (subscribe/get/set/…) are
   * RPC endpoints, not events, and are omitted deliberately.
   */
  broadcast: {
    authRevoked: 'devframe:auth:revoked',
    clientStateUpdated: 'devframe:rpc:client-state:updated',
    clientStatePatch: 'devframe:rpc:client-state:patch',
    streamingChunk: 'devframe:streaming:chunk',
    streamingEnd: 'devframe:streaming:end',
    streamingUploadCancel: 'devframe:streaming:upload-cancel',
  },
  /**
   * In-page channel notifications the page script pushes to its panels
   * (page script → panel), `devframe:` prefix. The paired request methods
   * (`devframe:in-page:page-state:subscribe`/`set`/`patch`) are call
   * endpoints, not events, and are defined at their handlers
   * (`in-page-channel/state.ts`).
   */
  inPageChannel: {
    panelStateUpdated: 'devframe:in-page:panel-state:updated',
    panelStatePatch: 'devframe:in-page:panel-state:patch',
  },
  /** `postMessage` channels the runtime posts across window boundaries. */
  postMessage: {
    remoteAssetsError: 'devframe:remote-assets-error',
    inPageChannel: 'devframe:in-page-channel',
  },
} as const
