import type { BirpcGroup, EventOptions } from 'birpc'
import type { Peer } from 'crossws'
import type { NodeAdapter } from 'crossws/adapters/node'
import type { WsOriginRegistry } from 'devframe/rpc/transports/ws-server'
import type { ConnectionMeta, DevframeNodeContext, DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from 'devframe/types'
import type { Server as NodeHttpServer } from 'node:http'
import type { DevframeAuthHandler } from './auth'
import type { RpcFunctionsHostImpl } from './host-functions'
import { createServer } from 'node:http'
import { attachWsRpcTransport } from 'devframe/rpc/transports/ws-server'
import { H3, toNodeHandler } from 'h3'
import { diagnostics } from './diagnostics'
import { getInternalContext } from './hub-internals/context'
import { createContextRpcServer } from './rpc-core'
import { formatHostForUrl, normalizeHttpServerUrl } from './utils'

export interface StartHttpAndWsOptions {
  context: DevframeNodeContext
  host?: string
  port: number
  /**
   * Optional h3 app to mount on. When omitted a fresh one is created;
   * when provided, callers can add their own routes (static handlers,
   * auth middleware, etc.) first.
   */
  app?: H3
  /**
   * Bind the WS endpoint to a single upgrade route (e.g. `/__ws`) instead of
   * claiming every upgrade on the port. This lets the socket share a server
   * with other upgrade handlers (Vite HMR, a host framework's own sockets)
   * and is what the SPA's `__connection.json` points at. When omitted, the WS
   * server handles every upgrade on the port (legacy behaviour).
   */
  path?: string
  /**
   * Bind the WS endpoint on its own port instead of sharing the HTTP server's.
   * The HTTP/SPA server still listens on `port`; the socket gets a dedicated
   * `ws` server on `wsPort` (same `host`). Use this for the "different port"
   * connection scenario. Ignored when a `server` is supplied.
   */
  wsPort?: number
  /**
   * Mount the WS endpoint onto an existing HTTP server, sharing its port,
   * rather than creating and listening on a fresh one. Use this to embed
   * devframe's RPC socket inside a host server (e.g. a Vite dev server) — pair
   * it with `path` so it coexists with the host's routes. The caller owns the
   * server's lifecycle: {@link StartedServer.close} detaches devframe's upgrade
   * listener but leaves the host server running. When set, `host`/`port` are
   * only used to report the resolved origin.
   */
  server?: NodeHttpServer
  /**
   * Authentication for the server:
   *
   *   - `true` (default) — no gate; every registered method is callable
   *     regardless of trust (today's behavior, unchanged).
   *   - `false` — the RPC server is started without a trust handshake.
   *     Intended for single-user localhost tools where an auth round-trip
   *     would only get in the way. A noop `anonymous:devframe:auth` handler
   *     is registered so the browser client's unconditional handshake call
   *     succeeds and auto-trusts.
   *   - A {@link DevframeAuthHandler} (e.g. from
   *     `devframe/recipes/interactive-auth`'s `createInteractiveAuth`) —
   *     registers its `rpcFunctions`, wires its `authorize` as the resolver
   *     gate, and wires its `onConnect` on every new peer. This is the
   *     fully-authenticated server: an untrusted caller can only reach
   *     `anonymous:`-prefixed methods (see `isAnonymousRpcMethod`).
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Lower-level escape hatch: gate individual RPC calls by method name and
   * session without a full {@link DevframeAuthHandler}. Ignored when `auth`
   * is a handler object (its own `authorize` is used); combine with `auth:
   * true` to layer a custom policy on top of an otherwise ungated server.
   */
  authorize?: (methodName: string, session: DevframeNodeRpcSession) => boolean
  /**
   * Called once per new WS connection, right after its session is created
   * (before any RPC call is dispatched). Runs after the auth handler's own
   * `onConnect` (when `auth` is a {@link DevframeAuthHandler}), so it can
   * observe — but not override — the connect-time trust decision.
   */
  onPeerConnect?: (peer: Peer, session: DevframeNodeRpcSession) => void
  /**
   * Called once per closed WS connection, right after the transport's own
   * disconnect bookkeeping runs. Unlike {@link onPeerConnect} this receives
   * the raw session meta, not a wrapped session — by the time a peer
   * disconnects there is no live RPC client left to attach.
   */
  onPeerDisconnect?: (peer: Peer, meta: DevframeNodeRpcSessionMeta) => void
  /**
   * Forwarded verbatim to the internal `createRpcServer`'s birpc
   * `rpcOptions`, alongside the resolver `startHttpAndWs` installs for
   * auth/session wiring. Use this so a host that owns its own structured
   * diagnostics (e.g. a coded error reporter) keeps seeing RPC failures
   * instead of them being silently absorbed by delegating to
   * `startHttpAndWs`. Returning `true` from either callback suppresses
   * birpc's own error response to the caller — see birpc's
   * `EventOptions` for the full contract.
   */
  rpcOptions?: Pick<
    EventOptions<DevframeRpcClientFunctions, DevframeRpcServerFunctions, false>,
    'onFunctionError' | 'onGeneralError'
  >
  /**
   * Extra origins to accept on the WS upgrade beyond the loopback default
   * (`localhost`/`127.0.0.1`/`::1` and any `Origin`-less request from a
   * native client). Add your LAN/tunnel origin here when reaching the tool
   * from another host. Pass `false` to disable origin checking entirely
   * (not recommended). Default: loopback-only.
   */
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  /**
   * Called once the WS server is bound so callers can mount static
   * handlers whose origin depends on the resolved port, or print their
   * own startup banner. Devframe does not print one itself.
   */
  onReady?: (info: { origin: string, port: number, app: H3 }) => void | Promise<void>
  /**
   * Called for any error the HTTP server devframe owns emits after it starts
   * listening — e.g. a transient `EMFILE` while accepting a connection.
   * Without it such an error has no listener and crashes the process.
   *
   * Applies only to a server devframe created itself. When `server` is
   * supplied the caller owns that object and attaches to it directly, so
   * devframe leaves its error handling alone.
   */
  onServerError?: (error: Error) => void
}

export interface StartedServer {
  /** Listening origin, e.g. `http://localhost:9999`. */
  origin: string
  port: number
  app: H3
  /** The crossws node adapter driving the RPC socket (connected peers, pub/sub). */
  ws: NodeAdapter
  rpcGroup: BirpcGroup<DevframeRpcClientFunctions, DevframeRpcServerFunctions, false>
  /**
   * The {@link ConnectionMeta} descriptor for this server — the same shape
   * a `__connection.json` route should serve so a devframe client's
   * `resolveWsUrl` can dial back in. Reflects the `path` / `wsPort` this
   * server was started with and the `jsonSerializable` methods currently
   * registered on `context.rpc`.
   */
  connectionMeta: () => ConnectionMeta
  close: () => Promise<void>
}

/**
 * Compose an h3 + WebSocket server for a devframe context. The RPC
 * group is bound to `context.rpc.functions`; the WS endpoint lives on
 * the same port as the HTTP server.
 */
export async function startHttpAndWs(options: StartHttpAndWsOptions): Promise<StartedServer> {
  const { context, port } = options
  const bindHost = options.host ?? 'localhost'
  const app = options.app ?? new H3()
  // When the caller supplies a server we share it (and never close it);
  // otherwise we own a fresh one bound to `app`.
  const ownsHttpServer = !options.server
  const httpServer = options.server ?? createServer(toNodeHandler(app))
  const rpcHost = context.rpc as unknown as RpcFunctionsHostImpl

  // Transport-agnostic RPC core: auth wiring, session resolver, and the
  // peer lifecycle handlers the WS transport below plugs into.
  const { rpcGroup, onConnected, onDisconnected } = createContextRpcServer({
    context,
    auth: options.auth,
    authorize: options.authorize,
    onPeerConnect: options.onPeerConnect,
    onPeerDisconnect: options.onPeerDisconnect,
    rpcOptions: options.rpcOptions,
  })

  // A dedicated WS port (the "different port" scenario) only applies when we
  // own the HTTP server — a shared host server already dictates the port.
  const separateWsPort = ownsHttpServer && options.wsPort != null && options.wsPort !== port
    ? options.wsPort
    : undefined
  const { ws, close: closeWs } = attachWsRpcTransport(rpcGroup, {
    // Share the HTTP server unless a separate WS port is requested, in which
    // case bind a standalone WS server on that port.
    ...(separateWsPort != null
      ? { port: separateWsPort, host: bindHost }
      : { server: httpServer }),
    path: options.path,
    // When we own the server nothing else handles its upgrades, so reject
    // off-route attempts promptly. A shared (caller-owned) server may host
    // other sockets, so leave non-matching upgrades for them.
    destroyUnmatched: ownsHttpServer,
    allowedOrigins: options.allowedOrigins,
    onConnected,
    onDisconnected,
  })

  // Only start listening on a server we created. A shared server is already
  // (or about to be) listening under the caller's control.
  if (ownsHttpServer) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => reject(error)
        // Without this listener a failed bind emits `error` with nobody
        // attached — an uncaughtException — and the `listen` callback never
        // fires, so this promise never settles.
        httpServer.once('error', onError)
        httpServer.listen(port, bindHost, () => {
          httpServer.removeListener('error', onError)
          resolve()
        })
      })
    }
    catch (error) {
      // The WS transport is already attached above, so tear it down before
      // surfacing the failure rather than leaking it and its peers.
      await closeWs().catch(() => {})
      throw diagnostics.DF0052({
        host: bindHost,
        port,
        reason: error instanceof Error ? error.message : String(error),
        cause: error,
      })
    }
    // Attached only now that the bind has already succeeded — this never
    // changes bind-time crash/hang semantics, only what happens afterward.
    if (options.onServerError)
      httpServer.on('error', options.onServerError)
  }

  const address = httpServer.address()
  const resolvedPort = typeof address === 'object' && address ? address.port : port
  // Advertise a dialable origin: a wildcard bind host (`0.0.0.0` / `::`) is not
  // reachable from a browser, so the URL a client opens falls back to loopback
  // even though the socket keeps listening on every interface.
  const origin = normalizeHttpServerUrl(bindHost, resolvedPort)
  const internal = getInternalContext(context)
  // Record the full WS URL (including the bound route) so consumers like the
  // hub docks host can hand remote iframes a complete endpoint. A dedicated WS
  // port is reflected here so the URL stays dialable.
  const wsPortForUrl = separateWsPort ?? resolvedPort
  const wsUrl = `ws://${formatHostForUrl(bindHost)}:${wsPortForUrl}${options.path ?? ''}`
  internal.wsEndpoint = {
    url: wsUrl,
  }

  if (options.onReady)
    await options.onReady({ origin, port: resolvedPort, app })

  function connectionMeta(): ConnectionMeta {
    const jsonSerializableMethods: string[] = []
    for (const def of rpcHost.definitions.values()) {
      if (def.jsonSerializable === true)
        jsonSerializableMethods.push(def.name)
    }
    const websocket = separateWsPort != null
      ? { port: separateWsPort, path: options.path }
      : { path: options.path }
    return { backend: 'websocket', websocket, jsonSerializableMethods }
  }

  return {
    origin,
    port: resolvedPort,
    app,
    ws,
    rpcGroup,
    connectionMeta,
    async close() {
      // Detaches the upgrade listener first (so a shared host server stops
      // routing new connections to us while other handlers keep working),
      // force-terminates every peer for deterministic teardown, and closes
      // any dedicated-port WS server the transport created.
      await closeWs()
      // Leave a caller-owned server running — we only created (and listen on)
      // our own.
      if (ownsHttpServer)
        await new Promise<void>(r => httpServer.close(() => r()))
      if (getInternalContext(context).wsEndpoint?.url === wsUrl)
        getInternalContext(context).wsEndpoint = undefined
    },
  }
}
