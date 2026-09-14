import type { McpAuthorization } from './devframe'

/**
 * The MCP adapter surface, typed here so `devframe` (which probes for and
 * lazily loads `@devframes/agentic`) and `@devframes/agentic/mcp` (which
 * implements it) share one contract without a type-level dependency cycle.
 * None of these shapes reference the MCP SDK: the SDK is an implementation
 * detail of `@devframes/agentic`, freely swappable behind this surface.
 * The h3-bound `mountMcpHttp` shapes live in `node/agentic.ts` (exported via
 * `devframe/internal`) instead: `devframe/types` must stay lib-neutral, and
 * h3's declarations are not.
 */
export interface CreateMcpServerOptions {
  /**
   * Transport to use. `createMcpServer` itself runs `'stdio'` (a standalone
   * process with its own host context); the Streamable-HTTP transport is
   * served route-based by the dev server instead; see `mountMcpHttp` and
   * the `mcp` option on `createDevServer` / `createCac`'s `--mcp` flag.
   */
  transport?: 'stdio'
  /**
   * Expose shared-state keys as MCP resources.
   * - `true` (default): every key the host publishes
   * - `false`: none
   * - `(key) => boolean`: filter
   */
  exposeSharedState?: boolean | ((key: string) => boolean)
  /** Override the name reported in the MCP handshake. */
  serverName?: string
  /** Override the version reported in the MCP handshake. Defaults to `definition.version ?? '0.0.0'`. */
  serverVersion?: string
  /** Called once the transport is connected. */
  onReady?: (info: { transport: 'stdio' }) => void
}

export interface McpServerHandle {
  stop: () => Promise<void>
}

export interface CreateMcpFetchHandlerOptions {
  /** Name reported in the MCP handshake. */
  serverName: string
  /** Version reported in the MCP handshake. */
  serverVersion: string
  /** Expose shared-state keys as MCP resources; see {@link CreateMcpServerOptions.exposeSharedState}. */
  exposeSharedState: boolean | ((key: string) => boolean)
  /**
   * Optional identity check, layered on top of the origin gate and checked
   * **after** it: a bearer token string (matched in constant time against
   * `Authorization: Bearer <token>`), a `(request) => boolean` callback, or
   * `false` (the default) for origin-only, trusting same-machine callers. A
   * callback governs identity only and cannot relax the origin gate. See
   * {@link McpAuthorization}.
   */
  authorization?: McpAuthorization
  /**
   * Origin allow-list beyond the loopback default. `false` disables the
   * origin gate entirely. Default: loopback-only.
   *
   * Unlike the WS transport, the MCP route does **not** allow `Origin`-less
   * requests: a route-based endpoint is reachable by any local process, so a
   * request must carry an `Origin` that passes the gate. Native clients
   * (e.g. `devframe connect`) send their loopback origin explicitly.
   */
  allowedOrigins?: readonly string[] | false
}

/** Connection facts a host knows about a request beyond the `Request` itself. */
export interface McpConnectionInfo {
  /**
   * The connecting peer's remote address (a node socket's `remoteAddress`),
   * used to prove a same-machine caller when the endpoint relies on the
   * loopback origin default with no identity check. A host that can resolve a
   * trustworthy peer address (the h3/node mount) supplies it; when it's
   * omitted the origin gate stays the only locality signal.
   */
  remoteAddress?: string
}

export interface McpFetchHandler {
  /**
   * WHATWG-`fetch` handler for the MCP endpoint. Hand every method
   * (POST/GET/DELETE) on the endpoint's path to it; routing by path is the
   * host's job. Pass {@link McpConnectionInfo} when the host can resolve the
   * peer address so the default trust boundary can enforce same-machine
   * locality.
   */
  fetch: (request: Request, connection?: McpConnectionInfo) => Promise<Response>
  /** Tear down the handler (aborts in-flight exchanges, drops the change bridge). */
  dispose: () => Promise<void>
}
