import type { BirpcGroup } from 'birpc'
import type { DevframeNodeContext, DevframeNodeRpcSession, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from 'devframe/types'
import type { Server as NodeHttpServer } from 'node:http'
import type { WebSocketServer } from 'ws'
import type { RpcFunctionsHost } from './host-functions'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createServer } from 'node:http'
import { createRpcServer } from 'devframe/rpc/server'
import { attachWsRpcTransport } from 'devframe/rpc/transports/ws-server'
import { H3, toNodeHandler } from 'h3'
import { getInternalContext } from './hub-internals/context'

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
   * Bind the WS endpoint to a single upgrade route (e.g. `/__devframe_ws`) instead of
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
   * When `false`, the RPC server is started without a trust handshake.
   * Intended for single-user localhost tools where an auth round-trip
   * would only get in the way. The Vite-flavoured auth layer in
   * `@vitejs/devtools` already honors the equivalent
   * `devtools.clientAuth` setting; devframe records the intent here so
   * future auth plumbing can consult it without another API change.
   *
   * Default: `true`.
   */
  auth?: boolean
  /**
   * Called once the WS server is bound so callers can mount static
   * handlers whose origin depends on the resolved port, or print their
   * own startup banner. Devframe does not print one itself.
   */
  onReady?: (info: { origin: string, port: number, app: H3 }) => void | Promise<void>
}

export interface StartedServer {
  /** Listening origin, e.g. `http://localhost:9999`. */
  origin: string
  port: number
  app: H3
  wss: WebSocketServer
  rpcGroup: BirpcGroup<DevframeRpcClientFunctions, DevframeRpcServerFunctions, false>
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
  const rpcHost = context.rpc as unknown as RpcFunctionsHost

  const asyncStorage = new AsyncLocalStorage<DevframeNodeRpcSession>()

  const rpcGroup = createRpcServer<DevframeRpcClientFunctions, DevframeRpcServerFunctions>(
    rpcHost.functions,
    {
      rpcOptions: {
        // Wrap each RPC handler in an AsyncLocalStorage context so
        // `ctx.rpc.getCurrentRpcSession()` works inside handlers (used
        // by streaming subscribe/unsubscribe/cancel and shared-state
        // sync). Mirrors `packages/core/src/node/ws.ts`'s resolver,
        // minus the auth gate (devframe defers auth to its host
        // adapters; the standalone CLI server is unauthenticated).
        resolver(name, fn) {
          // eslint-disable-next-line ts/no-this-alias
          const rpc = this
          if (!fn)
            return undefined
          return async function (this: any, ...args) {
            return await asyncStorage.run({
              rpc,
              meta: rpc.$meta,
            }, async () => {
              return (await fn).apply(this, args)
            })
          }
        },
      },
    },
  )

  // A dedicated WS port (the "different port" scenario) only applies when we
  // own the HTTP server — a shared host server already dictates the port.
  const separateWsPort = ownsHttpServer && options.wsPort != null && options.wsPort !== port
    ? options.wsPort
    : undefined
  const { wss, detach: detachWs } = attachWsRpcTransport(rpcGroup, {
    // Share the HTTP server unless a separate WS port is requested, in which
    // case bind a standalone `ws` server on that port.
    ...(separateWsPort != null
      ? { port: separateWsPort, host: bindHost }
      : { server: httpServer }),
    path: options.path,
    // When we own the server nothing else handles its upgrades, so reject
    // off-route attempts promptly. A shared (caller-owned) server may host
    // other sockets, so leave non-matching upgrades for them.
    destroyUnmatched: ownsHttpServer,
    onDisconnected: (_ws, meta) => {
      rpcHost._emitSessionDisconnected(meta)
    },
  })

  ;(rpcHost as any)._rpcGroup = rpcGroup
  ;(rpcHost as any)._asyncStorage = asyncStorage
  ;(rpcHost as any)._authDisabled = options.auth === false

  // The browser client unconditionally calls `devframe:anonymous:auth` on
  // connect (see `client/rpc-ws.ts`). When `auth: false` is set on the
  // standalone server, register a noop handler that auto-trusts so the
  // client's hardcoded handshake succeeds. The Vite-side adapter
  // registers the real handler with the same name; the two paths never
  // overlap because Vite consumers never opt into `auth: false`.
  if (options.auth === false && !rpcHost.definitions.has('devframe:anonymous:auth')) {
    rpcHost.register({
      name: 'devframe:anonymous:auth',
      type: 'action',
      handler: () => {
        const session = rpcHost.getCurrentRpcSession()
        if (session)
          session.meta.isTrusted = true
        return { isTrusted: true }
      },
    })
  }

  // Only start listening on a server we created. A shared server is already
  // (or about to be) listening under the caller's control.
  if (ownsHttpServer) {
    await new Promise<void>((resolveListen) => {
      httpServer.listen(port, bindHost, () => resolveListen())
    })
  }

  const address = httpServer.address()
  const resolvedPort = typeof address === 'object' && address ? address.port : port
  const origin = `http://${bindHost}:${resolvedPort}`
  const internal = getInternalContext(context)
  // Record the full WS URL (including the bound route) so consumers like the
  // hub docks host can hand remote iframes a complete endpoint. A dedicated WS
  // port is reflected here so the URL stays dialable.
  const wsPortForUrl = separateWsPort ?? resolvedPort
  const wsUrl = `ws://${bindHost}:${wsPortForUrl}${options.path ?? ''}`
  internal.wsEndpoint = {
    url: wsUrl,
  }

  if (options.onReady)
    await options.onReady({ origin, port: resolvedPort, app })

  return {
    origin,
    port: resolvedPort,
    app,
    wss,
    rpcGroup,
    async close() {
      // Detach our upgrade listener first so a shared host server stops
      // routing new connections to us (and other handlers keep working).
      detachWs()
      // `wss.close` only stops accepting new connections — existing ones
      // would keep the close callback pending until they disconnect on
      // their own. Force-terminate so callers can deterministically tear
      // the server down (tests, hot reload, graceful shutdown).
      for (const ws of wss.clients) ws.terminate()
      await new Promise<void>(r => wss.close(() => r()))
      // Leave a caller-owned server running — we only created (and listen on)
      // our own.
      if (ownsHttpServer)
        await new Promise<void>(r => httpServer.close(() => r()))
      if (getInternalContext(context).wsEndpoint?.url === wsUrl)
        getInternalContext(context).wsEndpoint = undefined
    },
  }
}
