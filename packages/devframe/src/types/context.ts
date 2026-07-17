import type { DevframeAgentHost } from './agent'
import type { DevframeDiagnosticsHost } from './diagnostics'
import type { DevframeHost } from './host'
import type { DevframeScopedNodeContext, SettingsForNamespace } from './scope'
import type { DevframeServicesHost } from './services'
import type { DevframeViewHost } from './views'

export interface DevframeCapabilities {
  rpc?: boolean
  views?: boolean
}

/**
 * Framework- and build-tool-agnostic node context — RPC + diagnostics +
 * agent + the view-host (HTTP file-serving). Host adapters can wrap this
 * to add their own surfaces; for example, `@vitejs/devtools-kit`'s
 * `createKitContext` adds `docks`, `terminals`, `messages`, and
 * `commands` when mounted into Vite DevTools.
 */
export interface DevframeNodeContext {
  readonly workspaceRoot: string
  readonly cwd: string
  /**
   * Lifecycle distinction surfaced to plugin authors:
   *
   *   - `'dev'`   — long-running, interactive session. Connections come and
   *                 go; broadcasts and shared-state mutations are debounced
   *                 to keep the UI responsive.
   *   - `'build'` — one-shot batch run. The context is set up, the devtool
   *                 collects what it needs, and a snapshot is written. No
   *                 live UI, no WS server.
   *
   * Names are inherited from Vite's serve/build dichotomy but the meaning
   * is general: the same distinction applies to any tool that runs in
   * either an interactive or a static-output mode.
   */
  readonly mode: 'dev' | 'build'
  /**
   * Host runtime abstraction — exposes `mountStatic` / `resolveOrigin` /
   * `getStorageDir`.
   */
  host: DevframeHost
  rpc: import('./rpc').RpcFunctionsHost
  views: DevframeViewHost
  /**
   * Structured diagnostics host — wraps `nostics` and lets integrations
   * register their own coded errors/warnings into the shared lookup.
   */
  diagnostics: DevframeDiagnosticsHost
  /**
   * Agent host — aggregates the agent-exposed surface of this devtool.
   *
   * @experimental
   */
  agent: DevframeAgentHost
  /**
   * Cross-plugin services — a typed, namespaced registry through which one
   * integration exposes a capability (e.g. a data-source registry) and
   * others consume it without a hard package dependency. Ids follow the RPC
   * namespacing rule (`<plugin-id>:<service>`); types come from augmenting
   * the `DevframeServicesRegistry` interface. `whenAvailable` subscriptions
   * absorb setup-order differences between provider and consumer.
   */
  services: DevframeServicesHost
  /**
   * Create a namespace-scoped view of this context. The returned
   * `ctx.scope('my-plugin')` auto-namespaces every RPC id, shared-state
   * key, and streaming channel with `my-plugin:`, and exposes a typed
   * top-level `settings` store. This is the preferred way to consume the
   * context from a single tool's setup code.
   *
   * Pass `null` or `''` to un-scope and get the base context.
   */
  scope: {
    <NS extends string>(namespace: NS): DevframeScopedNodeContext<NS, SettingsForNamespace<NS>>
    (namespace?: null | ''): DevframeNodeContext
  }
}

/**
 * Describes where the browser client should open its RPC WebSocket. The
 * object form is the proxy-flexible default: `path` is resolved relative to
 * where `__connection.json` was loaded, and the connection is made to the
 * page's own origin (only the `http`→`ws` / `https`→`wss` protocol swap is
 * applied). This survives reverse proxies that change the host/port, because
 * the client never trusts a server-baked hostname — it reuses its own.
 *
 * Set `port` (and/or `host`) only when the WS endpoint genuinely lives on a
 * different origin than the page, e.g. a side-car server on its own port.
 */
export interface ConnectionMetaWebsocket {
  /**
   * Path to the WS endpoint. Relative paths (the default, e.g. `__devframe_ws`) are
   * resolved against `__connection.json`'s location; absolute paths (`/__devframe_ws`)
   * resolve against the page origin.
   */
  path?: string
  /** Override the port. Combined with the page hostname unless `host` is set. */
  port?: number
  /** Override the host (`hostname[:port]`). Use for a fully cross-origin endpoint. */
  host?: string
}

export interface ConnectionMeta {
  backend: 'websocket' | 'static'
  /**
   * WebSocket endpoint, resolved by the client into a `ws(s)://` URL:
   *
   *   - {@link ConnectionMetaWebsocket} — the proxy-flexible default; a
   *     same-origin path relative to `__connection.json`.
   *   - `number` — a port on the page's hostname (`ws(s)://<host>:<port>`).
   *   - `string` — a full `ws://`/`wss://` URL used verbatim, an `http(s)://`
   *     URL with its protocol swapped, or a path resolved same-origin.
   */
  websocket?: number | string | ConnectionMetaWebsocket
  /**
   * Present when the dev server exposes a route-based MCP endpoint
   * (`cli.mcp`). Advertises the MCP Streamable-HTTP route so in-browser
   * tooling (e.g. an MCP inspector) can discover it without guessing the
   * path. `path` is relative to `__connection.json`'s location, like the
   * WebSocket `path`.
   */
  mcp?: { path: string }
  /**
   * Names of RPC functions that have declared `jsonSerializable: true`.
   * Used by the WS / static client to dispatch the per-call wire
   * serializer (strict JSON for these methods, structured-clone for
   * the rest). Populated by the server / build adapter; absent on
   * legacy clients, in which case all outgoing messages fall back to
   * structured-clone.
   */
  jsonSerializableMethods?: string[]
  /**
   * Absolute URL of the `__connection.json` this meta was loaded from.
   * Annotated by the client (not served) when it publishes the meta on a
   * shared window for same-origin inheritance: a relative `websocket.path`
   * resolves against this, so a child SPA mounted at another base (e.g. a hub
   * mounting several devframes at `/__foo/`, `/__bar/`, …) inherits a dialable
   * endpoint rather than resolving the path against its own mount.
   */
  baseUrl?: string
  /**
   * A pre-issued bearer token embedded in the meta so a client trusts the
   * server on connect without any prompt or `localStorage` lookup. Only a
   * **hub** serving a **per-frame** connection meta populates this — it
   * authenticates once at the top level and bakes the resulting token into
   * the meta each plugin iframe fetches, so a cross-origin frame (which
   * cannot read the hub's `localStorage`) is still pre-authorized. The
   * standalone `__connection.json` never carries a token.
   *
   * > [!WARNING]
   * > A token in a fetchable JSON is only as protected as the URL serving
   * > it. Emit it exclusively from hub-controlled, per-frame meta — never
   * > from a publicly reachable static `__connection.json`.
   */
  authToken?: string
}
