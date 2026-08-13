import type { BirpcGroup } from 'birpc'
import type { NodeAdapter } from 'crossws/adapters/node'
import type { DevframeRpcConnection, WsOriginRegistry, WsRpcTransport } from 'devframe/rpc/transports/ws-server'
import type { H3 } from 'h3'
import type { Buffer } from 'node:buffer'
import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ConnectionMeta, DevframeNodeContext, DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from '../types'
import type { DevframeWsOptions } from '../types/devframe'
import type { DevframeAuthHandler } from './auth'
import type { RpcFunctionsHostImpl } from './host-functions'
import type { DevframeInstanceRecord, DevframeInstanceRegistration } from './instance-registry'
import { createServer } from 'node:http'
import process from 'node:process'
import { H3 as H3App, toNodeHandler } from 'h3'
import { joinURL, withLeadingSlash, withoutLeadingSlash, withoutTrailingSlash } from 'ufo'
import { DEVFRAME_WS_ROUTE } from '../constants'
import { createInteractiveAuth } from '../recipes/interactive-auth'
import { diagnostics } from './diagnostics'
import { getInternalContext } from './hub-internals/context'
import { formatHostForUrl, normalizeHttpServerUrl } from './utils'

/**
 * The live handle for a bound HTTP + WebSocket RPC server — what the
 * side-car / shared-server tiers produce and what {@link createDevServer}
 * re-exposes through its own return contract.
 */
export interface StartedServer {
  /** Listening origin, e.g. `http://localhost:9999`. */
  origin: string
  port: number
  app: H3
  /** The crossws node adapter driving the RPC socket (connected peers, pub/sub). */
  ws: NodeAdapter
  rpcGroup: BirpcGroup<DevframeRpcClientFunctions, DevframeRpcServerFunctions, false>
  /**
   * The {@link ConnectionMeta} descriptor for this server — the same shape a
   * `__connection.json` route should serve so a devframe client's
   * `resolveWsUrl` can dial back in.
   */
  connectionMeta: () => ConnectionMeta
  close: () => Promise<void>
}

/** How {@link bindHttpAndWs} binds the socket: own a fresh server, or share one. */
interface BindHttpAndWsOptions {
  context: DevframeNodeContext
  host: string
  /** Listening port for an owned server; ignored when `server` is supplied. */
  port: number
  /** Share an existing `node:http` server instead of creating one. */
  server?: NodeHttpServer
  /** Bind the WS upgrade to a single route instead of every upgrade on the port. */
  path?: string
  auth?: boolean | DevframeAuthHandler
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  destroyUnmatched?: boolean
  onPeerConnect?: (connection: DevframeRpcConnection, session: DevframeNodeRpcSession) => void
  onPeerDisconnect?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
}

/**
 * Compose an h3 + WebSocket RPC server for a devframe context — the low-level
 * "listen on a port (or share one) + attach the WS transport" binding the
 * side-car and shared-server tiers below are built on. Owns and listens on a
 * fresh `node:http` server unless `server` is supplied, in which case it only
 * attaches the upgrade listener and leaves that server's lifecycle to its
 * owner.
 */
async function bindHttpAndWs(options: BindHttpAndWsOptions): Promise<StartedServer> {
  const { context, port } = options
  const bindHost = options.host
  const app = new H3App()
  const ownsHttpServer = !options.server
  const httpServer = options.server ?? createServer(toNodeHandler(app))
  const rpcHost = context.rpc as unknown as RpcFunctionsHostImpl

  const [{ createContextRpcServer }, { attachWsRpcTransport }] = await Promise.all([
    import('./rpc-core'),
    import('devframe/rpc/transports/ws-server'),
  ])

  const { rpcGroup, onConnected, onDisconnected } = createContextRpcServer({
    context,
    auth: options.auth,
    onPeerConnect: options.onPeerConnect,
    onPeerDisconnect: options.onPeerDisconnect,
  })

  const { ws, close: closeWs } = attachWsRpcTransport(rpcGroup, {
    server: httpServer,
    path: options.path,
    destroyUnmatched: options.destroyUnmatched ?? ownsHttpServer,
    allowedOrigins: options.allowedOrigins,
    onConnected,
    onDisconnected,
  })

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
  }

  const address = httpServer.address()
  const resolvedPort = typeof address === 'object' && address ? address.port : port
  const origin = normalizeHttpServerUrl(bindHost, resolvedPort)
  const internal = getInternalContext(context)
  const wsUrl = `ws://${formatHostForUrl(bindHost)}:${resolvedPort}${options.path ?? ''}`
  internal.wsEndpoint = { url: wsUrl }

  function connectionMeta(): ConnectionMeta {
    const jsonSerializableMethods: string[] = []
    for (const def of rpcHost.definitions.values()) {
      if (def.jsonSerializable === true)
        jsonSerializableMethods.push(def.name)
    }
    return { backend: 'websocket', websocket: { path: options.path }, jsonSerializableMethods }
  }

  return {
    origin,
    port: resolvedPort,
    app,
    ws,
    rpcGroup,
    connectionMeta,
    async close() {
      await closeWs()
      if (ownsHttpServer)
        await new Promise<void>(r => httpServer.close(() => r()))
      if (getInternalContext(context).wsEndpoint?.url === wsUrl)
        getInternalContext(context).wsEndpoint = undefined
    },
  }
}

/**
 * How the instance's RPC socket is bound:
 *
 * - `sidecar` — its own HTTP+WS server on a dedicated port (`ws.port` /
 *   `ws.sidecar`), advertised with that port.
 * - `server` — a shared upgrade route on the host's `node:http` server.
 * - `external` — no local transport: `ws.url` alone names a server that owns
 *   both the socket and its auth.
 * - `unbound` — the transport exists but nothing is bound to it yet; the host
 *   drives it through {@link InstanceShell.handleUpgrade} /
 *   {@link InstanceShell.attach}.
 */
export type InstanceWsTier = 'sidecar' | 'server' | 'external' | 'unbound'

/** The live shell surface an `init` / `mount` callback can reach. */
export interface InstanceShellApi {
  /** The normalized mount base, with leading and trailing slash. */
  base: string
  /** The h3 app every route is mounted on. */
  app: H3
  /** The public origin, once known (pinned, or derived from the first request). */
  origin: () => string | undefined
  /** The connection meta, once the transport has resolved. */
  connectionMeta: () => ConnectionMeta | undefined
}

/** What an instance's own initialization contributes to the shell. */
export interface InstanceShellInit<TContext extends DevframeNodeContext> {
  /** The context every mounted surface shares. */
  context: TContext
  /** The `mcp` entry to advertise, when an MCP route was mounted. */
  mcp?: ConnectionMeta['mcp']
  /** Torn down before the transport on `close()` (e.g. MCP sessions). */
  dispose?: () => Promise<void>
}

export interface CreateInstanceShellOptions<TContext extends DevframeNodeContext> {
  /** Normalized mount base (leading and trailing slash). */
  base: string
  /** h3 app to mount on. A fresh one is created when omitted. */
  app?: H3
  /** Public origin, or a getter. Derived from the first request when omitted. */
  origin?: string | (() => string)
  /** Resolved auth intent: `undefined`/`true` gates, `false` opts out, a handler installs a scheme. */
  auth?: boolean | DevframeAuthHandler
  /** Host `node:http` server to share the WS upgrade with. */
  server?: NodeHttpServer
  /** Explicit WebSocket control — see {@link DevframeWsOptions}. */
  ws?: DevframeWsOptions
  /** Bind host for a side-car WebSocket server. Default: `localhost`. */
  host?: string
  /** Extra WS-upgrade origins beyond the loopback default; `false` disables the gate. */
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  /** Destroy off-route upgrades on a shared `server`. */
  destroyUnmatchedUpgrades?: boolean
  onPeerConnect?: (connection: DevframeRpcConnection, session: DevframeNodeRpcSession) => void
  onPeerDisconnect?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  /**
   * Advertise the WS route as a base-absolute path (`<base>__ws`) instead of
   * the base-relative default. A hub serves one meta document from several
   * bases, so its clients need the absolute form to resolve the same socket.
   */
  absoluteWsPath?: boolean
  /** Pick the first port a `ws.sidecar` server tries. Default: a random free port. */
  resolveSidecarPort?: (host: string) => Promise<number>
  /**
   * Publish this instance in the global registry (`~/.devframe/instances/`)
   * once its public origin is known — a dynamic import so the registry code
   * stays out of instances that opt out. Omit to skip registration.
   */
  register?: InstanceRegisterConfig
  /** Create the context and mount everything that must precede the transport. */
  init: (api: InstanceShellApi) => Promise<InstanceShellInit<TContext>>
  /** Mount the routes that describe the resolved transport (discovery, SPA). */
  mount?: (context: TContext, meta: ConnectionMeta, api: InstanceShellApi) => void | Promise<void>
  /** Throw the instance's own diagnostic for `connectionMeta()` before readiness. */
  onMetaUnavailable: () => never
}

/**
 * The identity a shell needs to publish itself in the global instance
 * registry — the parts it can't derive on its own. The shell fills in
 * `pid` / `origin` / `port` / `basePath` / `mcp` / `startedAt` once the
 * origin resolves, then merges {@link InstanceRegisterConfig.overrides} last.
 */
export interface InstanceRegisterConfig {
  /** Definition id (or a synthetic one for a hub). */
  id: string
  /** Display name. */
  name?: string
  /** Working directory the instance runs from. Default: `process.cwd()`. */
  rootDir?: string
  /** Fields overriding the shell-derived record (from the public option's object form). */
  overrides?: Partial<DevframeInstanceRecord>
}

/**
 * Translate the public `register?: boolean | Partial<DevframeInstanceRecord>`
 * option into a shell {@link InstanceRegisterConfig}, or `undefined` when
 * registration is opted out. The object form supplies record overrides on top
 * of the caller-provided identity defaults.
 */
export function resolveInstanceRegister(
  option: boolean | Partial<DevframeInstanceRecord> | undefined,
  defaults: { id: string, name?: string, rootDir?: string },
): InstanceRegisterConfig | undefined {
  if (!option)
    return undefined
  return {
    id: defaults.id,
    ...(defaults.name !== undefined ? { name: defaults.name } : {}),
    ...(defaults.rootDir !== undefined ? { rootDir: defaults.rootDir } : {}),
    ...(typeof option === 'object' ? { overrides: option } : {}),
  }
}

/** Live internals the first-party adapters read off an instance. */
export interface InstanceShellInternals {
  readonly started?: StartedServer
  readonly authHandler?: DevframeAuthHandler
}

export interface InstanceShell<TContext extends DevframeNodeContext> {
  base: string
  handler: (request: Request) => Promise<Response>
  nodeMiddleware: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void
  ready: Promise<void>
  context: Promise<TContext>
  connectionMeta: () => ConnectionMeta
  /** Complete a host server's `upgrade` event on the instance's socket. */
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void
  /** Route a host server's `upgrade` events to the instance's socket. */
  attach: (server: NodeHttpServer) => () => void
  close: () => Promise<void>
  internals: InstanceShellInternals
}

/** Compare two URL paths ignoring a trailing slash. */
export function samePath(a: string, b: string): boolean {
  return withoutTrailingSlash(a) === withoutTrailingSlash(b)
}

/**
 * The shared machinery behind `initDevframe` and `initHub`: one mount base,
 * one h3 app, one lazily-derived public origin (and the auth banner that waits
 * for it), one WebSocket binding, and the fetch / connect-middleware pair that
 * serves them. Each factory supplies only what makes it itself — its context,
 * its routes, its diagnostics — through `init` / `mount`.
 *
 * Nothing here listens on a port unless a side-car was explicitly requested:
 * the default tier leaves the socket `unbound`, so a host chains it onto its
 * own server through {@link InstanceShell.attach} /
 * {@link InstanceShell.handleUpgrade}.
 *
 * @internal
 */
export function createInstanceShell<TContext extends DevframeNodeContext>(
  options: CreateInstanceShellOptions<TContext>,
): InstanceShell<TContext> {
  const base = options.base
  const baseNoSlash = withoutTrailingSlash(base)
  const app = options.app ?? new H3App()

  const ws = options.ws ?? {}
  const route = withoutLeadingSlash(ws.route ?? DEVFRAME_WS_ROUTE)
  /** Where an upgrade lands on the host's own origin. */
  const routePath = joinURL(base, route)
  /** What `__connection.json` advertises for a same-origin socket. */
  const advertisedPath = options.absoluteWsPath ? routePath : route
  const sidecarRequested = ws.port != null || ws.sidecar === true
  const tier: InstanceWsTier = sidecarRequested
    ? 'sidecar'
    : options.server
      ? 'server'
      : ws.url
        ? 'external'
        : 'unbound'

  // The public origin is often unknowable at creation (the host app owns the
  // listener) — derive it from the first request and let the auth banner
  // wait for it, unless the caller pinned one (as a string or a getter).
  let derivedOrigin: string | undefined
  function currentOrigin(): string | undefined {
    const explicit = typeof options.origin === 'function' ? options.origin() : options.origin
    return explicit || derivedOrigin
  }
  let authHandler: DevframeAuthHandler | undefined
  let bannerPrinted = false
  function maybePrintBanner(): void {
    if (bannerPrinted || !authHandler || !currentOrigin())
      return
    bannerPrinted = true
    authHandler.printBanner()
  }

  let meta: ConnectionMeta | undefined
  let registration: DevframeInstanceRegistration | undefined
  let registerPromise: Promise<void> | undefined
  /**
   * Publish the instance in the global registry the moment both its origin
   * and connection meta are known — at init end for a pinned origin, or on
   * the first request for a derived one. Registration never throws (the
   * registry writer degrades to a coded warning), so failures never surface.
   */
  function maybeRegister(): void {
    const cfg = options.register
    const origin = currentOrigin()
    if (!cfg || registerPromise || !origin || !meta)
      return
    const resolvedMeta = meta
    registerPromise = import('./instance-registry').then(({ registerDevframeInstance }) => {
      let port = 0
      try {
        const url = new URL(origin)
        port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
      }
      catch {}
      registration = registerDevframeInstance({
        pid: process.pid,
        port,
        origin,
        basePath: base,
        id: cfg.id,
        ...(cfg.name !== undefined ? { name: cfg.name } : {}),
        rootDir: cfg.rootDir ?? process.cwd(),
        mcp: resolvedMeta.mcp ? { path: joinURL(base, resolvedMeta.mcp.path) } : null,
        startedAt: Date.now(),
        ...cfg.overrides,
      })
    }).catch(() => {})
  }

  function noteOrigin(origin: string): void {
    derivedOrigin ??= origin
    maybePrintBanner()
    maybeRegister()
  }

  let started: StartedServer | undefined
  let transport: WsRpcTransport | undefined
  /** The `unbound` tier's resolved auth, held until its transport is built. */
  let unboundAuth: boolean | DevframeAuthHandler | undefined
  let dispose: (() => Promise<void>) | undefined
  let ctx: TContext

  const api: InstanceShellApi = {
    base,
    app,
    origin: currentOrigin,
    connectionMeta: () => meta,
  }

  /**
   * Auth resolution: gate by default, `false` opts out, a handler object
   * installs a custom scheme. The `external` tier has no local transport to
   * gate — the server behind `ws.url` owns auth — so it resolves to nothing.
   */
  function resolveAuth(): boolean | DevframeAuthHandler {
    if (options.auth === false)
      return false
    if (typeof options.auth === 'object') {
      authHandler = options.auth
      return options.auth
    }
    authHandler = createInteractiveAuth(ctx)
    return authHandler
  }

  /**
   * A side-car server on its own port. `getPort` probes and the bind can
   * still race (or disagree across the v4/v6 duals of `localhost`), so an
   * auto-port side-car retries on a fresh random port instead of failing
   * init; a pinned `ws.port` is honored as given and fails loudly.
   */
  async function startSidecar(auth: boolean | DevframeAuthHandler): Promise<StartedServer> {
    const sidecarHost = options.host ?? 'localhost'
    const start = (port: number): Promise<StartedServer> => bindHttpAndWs({
      context: ctx,
      host: sidecarHost,
      port,
      path: withLeadingSlash(route),
      auth,
      allowedOrigins: options.allowedOrigins,
      onPeerConnect: options.onPeerConnect,
      onPeerDisconnect: options.onPeerDisconnect,
    })
    if (ws.port != null)
      return await start(ws.port)
    const { getPort } = await import('get-port-please')
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      const port = attempt === 0 && options.resolveSidecarPort
        ? await options.resolveSidecarPort(sidecarHost)
        : await getPort({ random: true, host: sidecarHost })
      try {
        return await start(port)
      }
      catch (error) {
        lastError = error
      }
    }
    throw lastError
  }

  async function init(): Promise<void> {
    const result = await options.init(api)
    ctx = result.context
    dispose = result.dispose

    // The WebSocket binding. `ws.url`, when set alongside a local binding,
    // overrides only the *advertisement* — the tunnel pattern, where a relay
    // forwards to whatever this instance bound locally.
    const resolvedAuth = tier === 'external' ? false : resolveAuth()
    let websocketMeta: ConnectionMeta['websocket']
    if (tier === 'sidecar') {
      started = await startSidecar(resolvedAuth)
      websocketMeta = { port: started.port, path: route }
    }
    else if (tier === 'server') {
      // Shared upgrade on the host's own server at `<base><route>` — zero
      // extra ports, proxy/HTTPS friendly.
      started = await bindHttpAndWs({
        context: ctx,
        host: options.host ?? 'localhost',
        port: 0,
        server: options.server,
        path: routePath,
        auth: resolvedAuth,
        allowedOrigins: options.allowedOrigins,
        onPeerConnect: options.onPeerConnect,
        onPeerDisconnect: options.onPeerDisconnect,
        destroyUnmatched: options.destroyUnmatchedUpgrades,
      })
      websocketMeta = { path: advertisedPath }
    }
    else if (tier === 'external') {
      websocketMeta = ws.url!
    }
    else {
      // Advertised now, served once the host hands upgrades over: the
      // resolved auth waits with the transport it gates.
      unboundAuth = resolvedAuth
      websocketMeta = { path: advertisedPath }
    }
    if (ws.url)
      websocketMeta = ws.url

    meta = {
      backend: 'websocket',
      websocket: websocketMeta,
      ...(result.mcp ? { mcp: result.mcp } : {}),
    }

    await options.mount?.(ctx, meta, api)

    // A pinned origin means the banner and registry record needn't wait for a
    // first request.
    maybePrintBanner()
    maybeRegister()
  }

  const initPromise = init()
  // Surface init failures through `ready`/`handler`, never as an unhandled
  // rejection from the eager kick-off.
  initPromise.catch(() => {})
  const contextPromise = initPromise.then(() => ctx)
  contextPromise.catch(() => {})

  /**
   * The `unbound` tier: the RPC core and its crossws adapter, bound to
   * nothing. Built on the first `attach` / `handleUpgrade` — a host that
   * never wires the socket (or whose runtime brings its own WS transport)
   * pays nothing for it, not even the adapter's imports.
   */
  let transportPromise: Promise<WsRpcTransport> | undefined
  function ensureTransport(): Promise<WsRpcTransport> {
    transportPromise ??= initPromise.then(async () => {
      const [{ createContextRpcServer }, { attachWsRpcTransport }] = await Promise.all([
        import('./rpc-core'),
        import('devframe/rpc/transports/ws-server'),
      ])
      const core = createContextRpcServer({
        context: ctx,
        auth: unboundAuth!,
        onPeerConnect: options.onPeerConnect,
        onPeerDisconnect: options.onPeerDisconnect,
      })
      transport = attachWsRpcTransport(core.rpcGroup, {
        unbound: true,
        path: routePath,
        allowedOrigins: options.allowedOrigins,
        onConnected: core.onConnected,
        onDisconnected: core.onDisconnected,
      })
      return transport
    })
    return transportPromise
  }

  async function handleRequest(request: Request): Promise<Response> {
    await initPromise
    noteOrigin(new URL(request.url).origin)
    const response = await app.fetch(request)
    // Normalize a miss to a bare 404: an unmounted path falls through to
    // h3's default JSON-error handler, but for an asset host a body-less
    // 404 is cleaner and matches a plain static server.
    if (response.status === 404)
      return new Response(null, { status: 404 })
    return response
  }

  let nodeHandler: (req: IncomingMessage, res: ServerResponse) => void
  function nodeMiddleware(req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void): void {
    let pathname = req.url ?? '/'
    try {
      pathname = new URL(pathname, 'http://localhost').pathname
    }
    catch {}
    if (!(samePath(pathname, baseNoSlash) || pathname.startsWith(base))) {
      if (next) {
        next()
        return
      }
      res.statusCode = 404
      res.end()
      return
    }
    void initPromise
      .then(async () => {
        const host = req.headers.host
        if (host) {
          const encrypted = (req.socket as { encrypted?: boolean }).encrypted
          noteOrigin(`${encrypted ? 'https' : 'http'}://${host}`)
        }
        if (!nodeHandler) {
          const { toNodeHandler } = await import('h3/node')
          nodeHandler = toNodeHandler(app)
        }
        return nodeHandler(req, res)
      })
      .catch((err: unknown) => {
        if (next) {
          next(err)
          return
        }
        res.statusCode = 500
        res.end()
      })
  }

  /** The `unbound` tier is the only one whose socket the host may drive. */
  function assertUnbound(): void {
    if (tier === 'external')
      throw diagnostics.DF0056({ url: ws.url! })
    if (tier !== 'unbound')
      throw diagnostics.DF0055({ tier })
  }

  /**
   * Publish the socket's absolute URL on the context, so surfaces that hand
   * out a complete endpoint (the hub's remote docks) work on this tier too.
   * {@link bindHttpAndWs} does the same for the tiers it owns.
   */
  function publishWsEndpoint(server: NodeHttpServer): void {
    const record = (): void => {
      const address = server.address()
      if (typeof address !== 'object' || !address)
        return
      const host = options.host ?? (address.address === '::' || address.address === '0.0.0.0' ? 'localhost' : address.address)
      getInternalContext(ctx).wsEndpoint = {
        url: `ws://${formatHostForUrl(host)}:${address.port}${routePath}`,
      }
    }
    if (server.listening)
      record()
    else
      server.once('listening', record)
  }

  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    assertUnbound()
    // Once built the hand-off is synchronous; the first upgrade holds its
    // socket while the transport comes up (Node leaves it unread until
    // someone claims it) rather than being dropped.
    if (transport) {
      transport.handleUpgrade(req, socket, head)
      return
    }
    void ensureTransport()
      .then(live => live.handleUpgrade(req, socket, head))
      .catch(() => socket.destroy())
  }

  function attach(server: NodeHttpServer): () => void {
    assertUnbound()
    server.on('upgrade', handleUpgrade)
    // Build the transport now rather than on the first upgrade, so the socket
    // is live (and its absolute URL published) the moment the host is.
    void ensureTransport().then(() => publishWsEndpoint(server)).catch(() => {})
    return () => server.off('upgrade', handleUpgrade)
  }

  return {
    base,
    handler: handleRequest,
    nodeMiddleware,
    ready: initPromise,
    context: contextPromise,
    connectionMeta: () => meta ?? options.onMetaUnavailable(),
    handleUpgrade,
    attach,
    async close() {
      await initPromise.catch(() => {})
      await registerPromise?.catch(() => {})
      registration?.unregister()
      await dispose?.()
      await started?.close()
      await transportPromise?.then(live => live.close()).catch(() => {})
    },
    internals: {
      get started() {
        return started
      },
      get authHandler() {
        return authHandler
      },
    },
  }
}
