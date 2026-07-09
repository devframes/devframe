import type { Peer } from 'crossws'
import type { RpcFunctionDefinitionAny } from 'devframe/rpc'
import type { DevframeNodeRpcSession } from 'devframe/types'

/**
 * A ready-made pre-auth RPC handler, as produced by
 * `devframe/recipes/interactive-auth`'s `createInteractiveAuth`. Bundles
 * everything a host adapter needs to wire an authenticated server:
 * the handshake RPC functions, the resolver gate, the connect-time trust
 * hook, and the startup banner.
 *
 * `startHttpAndWs` accepts one of these directly via its `auth` option —
 * see {@link https://devfra.me | devframe}'s server docs — or a host can
 * wire the four pieces itself against a lower-level transport.
 */
export interface DevframeAuthHandler {
  /**
   * `anonymous:devframe:auth` + `anonymous:devframe:auth:exchange` (the
   * handshake) and `devframe:auth:revoke` (self-revoke) — register these on
   * the RPC host (e.g. `rpcHost.register(fn)` for each).
   */
  rpcFunctions: RpcFunctionDefinitionAny[]
  /**
   * Resolver gate: whether `methodName` is callable given `session`'s
   * current trust state. Defaults to allowing any `anonymous:`-prefixed
   * method (see `isAnonymousRpcMethod`) plus anything once the session is
   * trusted.
   */
  authorize: (methodName: string, session: DevframeNodeRpcSession) => boolean
  /**
   * Connect-time trust: reads a bearer token off the peer's upgrade request
   * (an `Authorization: Bearer <token>` header, or a static/pre-shared
   * token from `clientAuthTokens`) and, when valid, marks the session
   * trusted immediately — before the client's own handshake call.
   */
  onConnect: (peer: Peer, session: DevframeNodeRpcSession) => void
  /**
   * Print the current one-time code and its magic-link URL. Devframe stays
   * headless — call this yourself once the server is listening. Safe to
   * call repeatedly; it only prints once per code.
   */
  printBanner: () => void
}
