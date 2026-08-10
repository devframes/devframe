import type { Peer } from 'crossws'
import type { WsOriginRegistry } from 'devframe/rpc/transports/ws-server'
import type { ConnectionMeta, DevframeNodeContext, DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeStorageScope } from 'devframe/types'
import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { DevframeAuthHandler } from '../node/auth/handler'
import type { StartedServer } from '../node/server'
import type { BunWsTier } from '../rpc/transports/ws-bun'
import type { DevframeDefinition, DevframeSetupInfo, DevframeWsOptions, McpRouteOptions } from '../types/devframe'
import process from 'node:process'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { H3, toNodeHandler } from 'h3'
import { resolve } from 'pathe'
import { joinURL, withLeadingSlash, withoutLeadingSlash, withoutTrailingSlash } from 'ufo'
import { DEVFRAME_CONNECTION_META_FILENAME, DEVFRAME_WS_ROUTE } from '../constants'
import { createHostContext } from '../node/context'
import { diagnostics } from '../node/diagnostics'
import { createH3DevframeHost } from '../node/host-h3'
import { startHttpAndWs } from '../node/server'
import { createInteractiveAuth } from '../recipes/interactive-auth'
import { normalizeBasePath } from './_shared'
import { resolveDevServerPort, resolveMcpConnectionMeta } from './dev'

export interface InitDevframeOptions {
  /**
   * Mount base the handler answers under (e.g. `/__my-tool/`) — required so
   * the mount path is explicit at the call site. A handler is by definition
   * mounted *inside* a host app's origin; the resolved value is echoed back
   * as {@link DevframeInstance.base} so route/middleware code references it
   * instead of repeating the string. `resolveBasePath(def, 'hosted')` gives
   * the conventional `def.basePath ?? /__<id>/`.
   */
  base: string
  /**
   * Override `def.cli?.distDir`. When neither is set — or `false` is passed
   * to suppress the definition's own `distDir` — the handler runs in
   * **bridge mode**: only `__connection.json`, the WS endpoint, and the MCP
   * route (when enabled) are served; the SPA is hosted elsewhere.
   */
  distDir?: string | false
  /**
   * Share the host's `node:http` server for the WebSocket RPC endpoint: the
   * upgrade listener binds to `<base>__ws` on this server, so no extra port
   * is needed and the socket follows the app through proxies/HTTPS. When
   * omitted (and no `ws.url`/`ws.port` is given), an **eager side-car**
   * WebSocket server starts on its own port at handler creation. Under Bun,
   * the default is the fetch-upgrade tier instead — no side-car; pass the
   * `Bun.serve` server as `handler`'s second argument and wire
   * {@link DevframeInstance.websocket}.
   */
  server?: NodeHttpServer
  /**
   * Explicit control over how the browser reaches the RPC WebSocket —
   * advertised in `__connection.json`. Precedence `url` > `port` > `route`
   * (see {@link DevframeWsOptions}). `url` controls the *advertisement*
   * only: the browser dials it verbatim (a tunnel/relay). The local
   * binding still follows `server`/`ws.port` when given — the tunnel
   * pattern, where the relay forwards to the locally-bound socket — and
   * when neither is given, the handler starts **no transport of its own**
   * (run `startHttpAndWs({ context, server, path })` against
   * {@link DevframeInstance.context} to serve RPC from your own server).
   */
  ws?: DevframeWsOptions
  /**
   * Bind host for a side-car WebSocket server (default: `def.cli?.host ??
   * 'localhost'`). Irrelevant for the `server` / `ws.url` / Bun tiers.
   */
  host?: string
  /**
   * Authentication for the RPC endpoint. A handler mounted inside an app
   * server is reachable by anything that can open its socket, so it **gates
   * by default**: when unset (or `true`), devframe's interactive OTP handler
   * is wired and its code/link banner prints once the public origin is known
   * (derived from the first request, or `origin`). Pass a
   * {@link DevframeAuthHandler} for a custom scheme, or `false` to opt out
   * for a single-user localhost setup that owns the trust boundary another
   * way. Ignored for the `ws.url` tier — the server behind that URL owns auth.
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Expose a route-based MCP server (Streamable-HTTP) at `<base>__mcp` and
   * advertise it in `__connection.json`. Overrides `def.cli?.mcp`;
   * `undefined` falls through to it. See {@link McpRouteOptions}.
   */
  mcp?: boolean | McpRouteOptions
  /**
   * Memoize the handler on `globalThis` under this key. Dev servers that
   * re-evaluate modules on the fly (Next.js, Nitro, SvelteKit HMR) re-run
   * `initDevframe` on every reload — without a key each run would leak an
   * eager side-car WebSocket server. With a key, a re-run returns the live
   * instance; if the options changed, the old instance is closed and
   * replaced (reported as `DF0053`).
   */
  key?: string
  /**
   * Public origin the host app is reachable at (e.g. `http://localhost:3000`),
   * or a getter for hosts that resolve it late. When omitted (or the getter
   * returns a falsy value), it is derived lazily from the first request the
   * handler serves — used for the auth banner's magic link and absolute dock
   * URLs.
   */
  origin?: string | (() => string)
  /** Parsed flag bag forwarded to `def.setup(ctx, { flags })`. */
  flags?: Record<string, unknown>
  /**
   * Extra origins to accept on the WS upgrade beyond the loopback default.
   * Add your LAN/tunnel origin here when reaching the tool from another
   * host. Pass `false` to disable origin checking entirely (not
   * recommended). Default: loopback-only.
   */
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  /**
   * h3 app to mount the handler's routes on. When omitted a fresh internal
   * app is created — the common middleware case. An adapter that owns the
   * whole server (e.g. `createDevServer`) passes its own app so callers can
   * compose custom routes ahead of devframe's.
   */
  app?: H3
  /**
   * Override where persisted devframe state lives, per
   * `DevframeHost.getStorageDir`. Defaults to the standalone host layout
   * (`.devframe/`, `node_modules/.<id>/devframe/`, `~/.<id>/devframe/`).
   */
  getStorageDir?: (scope: DevframeStorageScope) => string
  /**
   * Destroy upgrade requests on a shared `server` that don't match the WS
   * route, instead of leaving them for the host's own upgrade handlers.
   * Enable when devframe's adapter owns the server outright (nothing else
   * handles its upgrades) so off-route clients are rejected promptly.
   * Default: `false` (coexist-friendly).
   */
  destroyUnmatchedUpgrades?: boolean
  /**
   * Called once per new WS connection, right after its session is created.
   * Forwarded verbatim to the underlying transport (see
   * `StartHttpAndWsOptions.onPeerConnect`).
   */
  onPeerConnect?: (peer: Peer, session: DevframeNodeRpcSession) => void
  /**
   * Called once per closed WS connection, right after the transport's own
   * disconnect bookkeeping runs (see `StartHttpAndWsOptions.onPeerDisconnect`).
   */
  onPeerDisconnect?: (peer: Peer, meta: DevframeNodeRpcSessionMeta) => void
}

/**
 * Bun `Bun.serve({ websocket })` handlers, delegating to the handler's
 * WebSocket transport. Only active under Bun (the fetch-upgrade tier);
 * inert no-ops elsewhere. Typed structurally so devframe carries no
 * dependency on Bun's types — cast to Bun's `WebSocketHandler` at the
 * `Bun.serve` call site if your host file typechecks against `bun-types`.
 */
export interface DevframeInstanceWebSocket {
  open: (ws: unknown) => void
  message: (ws: unknown, message: unknown) => void
  close: (ws: unknown, code?: number, reason?: string) => void
  drain: (ws: unknown) => void
}

export interface DevframeInstance {
  /**
   * The normalized mount base this instance answers under (leading and
   * trailing slash, e.g. `/__my-tool/`). Reference it when wiring the mount
   * — route guards, middleware path checks — instead of repeating the
   * string literal.
   */
  base: string
  /**
   * Web-standard request handler — mount it on a catch-all route under
   * {@link DevframeInstance.base} (Next.js route handler, SvelteKit
   * `+server.ts`, Hono `c.req.raw`, Nitro `toWebRequest(event)`, …).
   * Requests outside the base 404. Under Bun, pass the `Bun.serve` server
   * as the second argument so WS upgrade requests can be completed (an
   * upgraded request resolves to `undefined` per Bun's contract, typed as
   * `Response` for drop-in route-handler compatibility).
   */
  handler: (request: Request, server?: unknown) => Promise<Response>
  /**
   * Connect/Express-style middleware over the same surface — for
   * `viteServer.middlewares.use(handler.nodeMiddleware)` or any other
   * node middleware stack. Mount it un-prefixed: paths outside the base
   * call `next()` so the rest of the stack keeps working.
   */
  nodeMiddleware: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void
  /** See {@link DevframeInstanceWebSocket}. */
  websocket: DevframeInstanceWebSocket
  /**
   * Resolves once `def.setup` has run and the WebSocket binding is live.
   * `handler`/`nodeMiddleware` await it internally, so hosts never race
   * initialization — await it yourself only when you need the timing.
   */
  ready: Promise<void>
  /** The node context, once initialized — for advanced wiring (own WS transport, extra RPC registration). */
  context: Promise<DevframeNodeContext>
  /**
   * The `ConnectionMeta` this handler serves at `<base>__connection.json`.
   * Only readable after initialization (`DF0054` otherwise).
   */
  connectionMeta: () => ConnectionMeta
  /** Tear down: WS transport/side-car, MCP sessions, memo-registry entry. */
  close: () => Promise<void>
}

interface InstanceRegistryEntry {
  hash: string
  handler: DevframeInstance
}

const REGISTRY_KEY = Symbol.for('devframe:instance-registry')

function instanceRegistry(): Map<string, InstanceRegistryEntry> {
  const holder = globalThis as { [REGISTRY_KEY]?: Map<string, InstanceRegistryEntry> }
  holder[REGISTRY_KEY] ??= new Map()
  return holder[REGISTRY_KEY]
}

/**
 * Fingerprint the option surface that changes a handler's observable
 * behavior, for `key` memoization. Non-serializable options (a custom auth
 * handler, the shared server) participate as identity markers only — a new
 * object on every module re-evaluation would defeat memoization, which is
 * exactly the scenario `key` exists for.
 */
function optionsHash(def: DevframeDefinition, options: InitDevframeOptions): string {
  return JSON.stringify({
    id: def.id,
    base: options.base,
    distDir: options.distDir,
    host: options.host,
    origin: typeof options.origin === 'function' ? 'getter' : options.origin,
    ws: options.ws,
    server: options.server != null,
    app: options.app != null,
    auth: typeof options.auth === 'object' ? 'custom' : options.auth,
    mcp: options.mcp,
    allowedOrigins: Array.isArray(options.allowedOrigins) ? options.allowedOrigins : typeof options.allowedOrigins,
    getStorageDir: options.getStorageDir != null,
    destroyUnmatchedUpgrades: options.destroyUnmatchedUpgrades,
    cwd: process.cwd(),
  })
}

/** Compare two URL paths ignoring a trailing slash. */
function samePath(a: string, b: string): boolean {
  return withoutTrailingSlash(a) === withoutTrailingSlash(b)
}

/**
 * Live internals of a handler, for the first-party adapters built on it
 * (`createDevServer` exposes the transport's `ws`/`rpcGroup` through its
 * `StartedServer` contract).
 *
 * @internal
 */
export interface DevframeInstanceInternals {
  /** The `startHttpAndWs` handle backing the side-car / shared-server WS tiers. */
  readonly started?: StartedServer
  /** The resolved auth handler when the gate is active. */
  readonly authHandler?: DevframeAuthHandler
}

const INSTANCE_INTERNALS = new WeakMap<object, DevframeInstanceInternals>()

/** @internal */
export function getInstanceInternals(handler: object): DevframeInstanceInternals {
  return INSTANCE_INTERNALS.get(handler) ?? {}
}

/**
 * Serve a devframe through one framework-agnostic, web-standard handler —
 * the SPA, `__connection.json` discovery, the WebSocket RPC endpoint, the
 * auth gate, and the optional MCP route, all under a single mount base.
 * Mount `handler` on any framework's catch-all route (or `nodeMiddleware` on
 * a connect stack) and the devframe is live inside that app.
 *
 * The factory is synchronous and kicks off initialization eagerly;
 * `handler`/`nodeMiddleware` await readiness internally. The WebSocket
 * binding resolves in precedence order — `ws.port` (explicit side-car) >
 * `server` (shared upgrade at `<base>__ws`) > `ws.url` alone (no local
 * transport; an external server owns it) > Bun fetch-upgrade (under Bun) >
 * an eager side-car on a free port — while `ws.url`, when set, always
 * overrides the *advertised* endpoint (the tunnel pattern).
 * `__connection.json` reflects whichever combination is active.
 */
export function initDevframe(
  def: DevframeDefinition,
  options: InitDevframeOptions,
): DevframeInstance {
  if (options.key) {
    const registry = instanceRegistry()
    const hash = optionsHash(def, options)
    const existing = registry.get(options.key)
    if (existing) {
      if (existing.hash === hash)
        return existing.handler
      diagnostics.DF0053({ key: options.key, id: def.id })
      void existing.handler.close().catch(() => {})
    }
    const handler = instantiateDevframe(def, options)
    registry.set(options.key, { hash, handler })
    return handler
  }
  return instantiateDevframe(def, options)
}

function instantiateDevframe(
  def: DevframeDefinition,
  options: InitDevframeOptions,
): DevframeInstance {
  const base = normalizeBasePath(options.base)
  const baseNoSlash = withoutTrailingSlash(base)
  const distDir = options.distDir === false ? undefined : options.distDir ?? def.cli?.distDir
  const app = options.app ?? new H3()

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
  function noteOrigin(origin: string): void {
    derivedOrigin ??= origin
    maybePrintBanner()
  }

  let meta: ConnectionMeta | undefined
  let started: StartedServer | undefined
  let bunTier: BunWsTier | undefined
  let bunUpgradePath: string | undefined
  let mcpDispose: (() => Promise<void>) | undefined
  let ctx: DevframeNodeContext

  async function init(): Promise<void> {
    const h3Host = createH3DevframeHost({
      origin: () => currentOrigin() ?? 'http://localhost',
      appName: def.id,
      mount: (mountBase, dir) => {
        mountStaticHandler(app, mountBase, dir)
      },
    })
    const host = options.getStorageDir
      ? { ...h3Host, getStorageDir: options.getStorageDir }
      : h3Host
    ctx = await createHostContext({
      cwd: process.cwd(),
      mode: 'dev',
      host,
    })
    const setupInfo: DevframeSetupInfo = { flags: options.flags ?? {} }
    await def.setup(ctx, setupInfo)

    // Route-based MCP server (opt-in). Mounted before the SPA static
    // catch-all so the exact `<base>__mcp` route wins, and advertised in
    // `__connection.json`. The MCP SDK stays an optional peer — its code is
    // only pulled in (dynamically) when the route is enabled.
    const mcpOption = options.mcp ?? def.cli?.mcp
    const mcpMeta = resolveMcpConnectionMeta(def, mcpOption)
    if (mcpMeta) {
      const mcpConfig = mcpOption === true || mcpOption === undefined ? {} : mcpOption as McpRouteOptions
      const mcpPath = joinURL(base, mcpMeta.path)
      let mountMcpHttp: typeof import('./mcp/http').mountMcpHttp
      try {
        ;({ mountMcpHttp } = await import('./mcp/http'))
      }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw diagnostics.DF0017({ transport: 'http', reason, cause: error })
      }
      const mounted = mountMcpHttp(app, ctx, mcpPath, {
        serverName: `${def.id} (devframe)`,
        serverVersion: def.version ?? '0.0.0',
        exposeSharedState: true,
        allowedOrigins: mcpConfig.allowedOrigins,
      })
      mcpDispose = mounted.dispose
    }

    // WebSocket binding resolution — explicit `ws.port` side-car > shared
    // `server` > Bun fetch-upgrade > eager auto side-car; `ws.url`, when
    // set, overrides only the *advertised* endpoint (the tunnel pattern:
    // the relay forwards to whatever local binding the rest configured),
    // and suppresses the default binding entirely when no explicit
    // `server`/`ws.port` is given (an external server owns the transport).
    const ws = options.ws ?? def.cli?.ws ?? {}
    const route = withoutLeadingSlash(ws.route ?? DEVFRAME_WS_ROUTE)

    // Auth resolution mirrors `createDevServer`: gate by default, explicit
    // `false` opts out, a handler object installs a custom scheme.
    const authOption = options.auth !== undefined ? options.auth : def.cli?.auth
    let resolvedAuth: boolean | DevframeAuthHandler
    if (authOption === false) {
      resolvedAuth = false
    }
    else if (typeof authOption === 'object') {
      authHandler = authOption
      resolvedAuth = authOption
    }
    else {
      authHandler = createInteractiveAuth(ctx)
      resolvedAuth = authHandler
    }

    let websocketMeta: ConnectionMeta['websocket']
    if (ws.port != null) {
      // Explicit side-car port.
      const sidecarHost = options.host ?? def.cli?.host ?? 'localhost'
      started = await startHttpAndWs({
        context: ctx,
        host: sidecarHost,
        port: ws.port,
        path: withLeadingSlash(route),
        auth: resolvedAuth,
        allowedOrigins: options.allowedOrigins,
        onPeerConnect: options.onPeerConnect,
        onPeerDisconnect: options.onPeerDisconnect,
      })
      websocketMeta = { port: started.port, path: route }
    }
    else if (options.server) {
      // Shared upgrade on the host's own server at `<base><route>` — zero
      // extra ports, proxy/HTTPS friendly.
      started = await startHttpAndWs({
        context: ctx,
        port: 0,
        server: options.server,
        path: joinURL(base, route),
        auth: resolvedAuth,
        allowedOrigins: options.allowedOrigins,
        onPeerConnect: options.onPeerConnect,
        onPeerDisconnect: options.onPeerDisconnect,
        destroyUnmatched: options.destroyUnmatchedUpgrades,
      })
      websocketMeta = { path: route }
    }
    else if (ws.url) {
      // Advertise-only: an external server owns transport and auth.
      authHandler = undefined
      websocketMeta = ws.url
    }
    else if (typeof (globalThis as any).Bun === 'undefined') {
      // Eager auto side-car on a free port — the default when no host
      // server is shared (and we're not under Bun).
      const sidecarHost = options.host ?? def.cli?.host ?? 'localhost'
      const port = await resolveDevServerPort(def, { host: sidecarHost })
      started = await startHttpAndWs({
        context: ctx,
        host: sidecarHost,
        port,
        path: withLeadingSlash(route),
        auth: resolvedAuth,
        allowedOrigins: options.allowedOrigins,
        onPeerConnect: options.onPeerConnect,
        onPeerDisconnect: options.onPeerDisconnect,
      })
      websocketMeta = { port: started.port, path: route }
    }
    else {
      // Bun fetch-upgrade — same-origin upgrades completed through
      // `handler(request, server)`, hooks exposed via `websocket`.
      const { attachBunWsTransport } = await import('../rpc/transports/ws-bun')
      const { createContextRpcServer } = await import('../node/rpc-core')
      const core = createContextRpcServer({
        context: ctx,
        auth: resolvedAuth,
        onPeerConnect: options.onPeerConnect,
        onPeerDisconnect: options.onPeerDisconnect,
      })
      bunTier = await attachBunWsTransport(core, { allowedOrigins: options.allowedOrigins })
      bunUpgradePath = joinURL(base, route)
      websocketMeta = { path: route }
    }
    // The tunnel pattern: `ws.url` overrides the advertisement while the
    // local binding above keeps serving (the relay forwards to it).
    if (ws.url)
      websocketMeta = ws.url

    // Discovery meta before the SPA mount so its SPA-fallback can't swallow
    // the route; both sit at the SPA root for relative `./__connection.json`
    // fetches.
    meta = {
      backend: 'websocket',
      websocket: websocketMeta,
      ...(mcpMeta ? { mcp: mcpMeta } : {}),
    }
    app.use(joinURL(base, DEVFRAME_CONNECTION_META_FILENAME), () => meta)

    if (distDir)
      mountStaticHandler(app, base, resolve(distDir))

    // A pinned origin means the banner needn't wait for a first request.
    maybePrintBanner()
  }

  const initPromise = init()
  // Surface init failures through `ready`/`handler`, never as an unhandled
  // rejection from the eager kick-off.
  initPromise.catch(() => {})
  const contextPromise = initPromise.then(() => ctx)
  contextPromise.catch(() => {})

  async function handleRequest(request: Request, server?: unknown): Promise<Response> {
    await initPromise
    const url = new URL(request.url)
    noteOrigin(url.origin)
    if (bunTier && samePath(url.pathname, bunUpgradePath!)
      && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      if (!server) {
        return new Response(
          'Upgrade Required: pass the Bun server as the second argument to instance.handler(request, server)',
          { status: 426 },
        )
      }
      // An upgraded request resolves to `undefined` per Bun's contract; the
      // cast keeps `handler` drop-in assignable to route handlers that expect
      // a `Response`.
      return await bunTier.handleUpgrade(request, server) as Response
    }
    const response = await app.fetch(request)
    // Normalize a miss to a bare 404: an unmounted path falls through to
    // h3's default JSON-error handler, but for an asset host a body-less
    // 404 is cleaner and matches a plain static server.
    if (response.status === 404)
      return new Response(null, { status: 404 })
    return response
  }

  const nodeHandler = toNodeHandler(app)
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
      .then(() => {
        const host = req.headers.host
        if (host) {
          const encrypted = (req.socket as { encrypted?: boolean }).encrypted
          noteOrigin(`${encrypted ? 'https' : 'http'}://${host}`)
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

  const websocket: DevframeInstanceWebSocket = {
    open: ws => void bunTier?.websocket.open?.(ws),
    message: (ws, message) => void bunTier?.websocket.message(ws, message),
    close: (ws, code, reason) => void bunTier?.websocket.close?.(ws, code, reason),
    drain: ws => void bunTier?.websocket.drain?.(ws),
  }

  const handler: DevframeInstance = {
    base,
    handler: handleRequest,
    nodeMiddleware,
    websocket,
    ready: initPromise,
    context: contextPromise,
    connectionMeta: () => {
      if (!meta)
        throw diagnostics.DF0054({ id: def.id })
      return meta
    },
    close: async () => {
      if (options.key) {
        const registry = instanceRegistry()
        if (registry.get(options.key)?.handler === handler)
          registry.delete(options.key)
      }
      await initPromise.catch(() => {})
      await mcpDispose?.()
      await started?.close()
      await bunTier?.close()
    },
  }
  INSTANCE_INTERNALS.set(handler, {
    get started() {
      return started
    },
    get authHandler() {
      return authHandler
    },
  })
  return handler
}
