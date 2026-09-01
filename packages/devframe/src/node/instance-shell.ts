import type { BirpcGroup } from 'birpc'
import type { NodeAdapter } from 'crossws/adapters/node'
import type { SseRpcTransport } from 'devframe/rpc/transports/sse-server'
import type { DevframeRpcConnection, WsOriginRegistry, WsRpcTransport } from 'devframe/rpc/transports/ws-server'
import type { H3, H3Event } from 'h3'
import type { Buffer } from 'node:buffer'
import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ConnectionMeta, DevframeNodeContext, DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeRpcClientFunctions, DevframeRpcServerFunctions } from '../types'
import type { DevframeSseOptions, DevframeWsOptions } from '../types/devframe'
import type { DevframeAuthHandler } from './auth'
import type { RpcFunctionsHostImpl } from './host-functions'
import type { DevframeInstanceRecord, DevframeInstanceRegistration } from './instance-registry'
import type { ContextRpcServer } from './rpc-core'
import { createServer } from 'node:http'
import process from 'node:process'
import { validateOriginCandidate } from 'devframe/utils/origin'
import { defineHandler, H3 as H3App, toNodeHandler } from 'h3'
import { joinURL, withLeadingSlash, withoutLeadingSlash, withoutTrailingSlash } from 'ufo'
import { DEVFRAME_SSE_ROUTE, DEVFRAME_WS_ROUTE } from '../constants'
import { createInteractiveAuth } from '../recipes/interactive-auth'
import { diagnostics } from './diagnostics'
import { getInternalContext } from './hub-internals/context'
import { detectServerRuntime } from './runtime'
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
  /**
   * The crossws node adapter driving the RPC socket (connected peers,
   * pub/sub). Absent when the WebSocket transport is disabled (`ws: false`).
   */
  ws?: NodeAdapter
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
  /** The context's RPC core (birpc group + connection lifecycle hooks). */
  core: ContextRpcServer
  host: string
  /** Listening port for an owned server; ignored when `server` is supplied. */
  port: number
  /** Share an existing `node:http` server instead of creating one. */
  server?: NodeHttpServer
  /** Bind the WS upgrade to a single route instead of every upgrade on the port. */
  path?: string
  /** Set `false` to bind HTTP only — no WebSocket transport at all. */
  websocket?: boolean
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  destroyUnmatched?: boolean
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
  const { context, port, core } = options
  const bindHost = options.host
  const app = new H3App()
  const ownsHttpServer = !options.server
  const httpServer = options.server ?? createServer(toNodeHandler(app))
  const rpcHost = context.rpc as unknown as RpcFunctionsHostImpl
  const websocket = options.websocket !== false

  let ws: NodeAdapter | undefined
  let closeWs = async (): Promise<void> => {}
  if (websocket) {
    const { attachWsRpcTransport } = await import('devframe/rpc/transports/ws-server')
    const transport = attachWsRpcTransport(core.rpcGroup, {
      server: httpServer,
      path: options.path,
      destroyUnmatched: options.destroyUnmatched ?? ownsHttpServer,
      allowedOrigins: options.allowedOrigins,
      onConnected: core.onConnected,
      onDisconnected: core.onDisconnected,
    })
    ws = transport.ws
    closeWs = transport.close
  }

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
  if (websocket)
    internal.setWsEndpoint({ url: wsUrl })

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
    rpcGroup: core.rpcGroup,
    connectionMeta,
    async close() {
      await closeWs()
      if (ownsHttpServer)
        await new Promise<void>(r => httpServer.close(() => r()))
      if (websocket && getInternalContext(context).wsEndpoint?.url === wsUrl)
        getInternalContext(context).setWsEndpoint(undefined)
    },
  }
}

/**
 * Structural view of `Bun.serve` — typed loosely so devframe carries no
 * dependency on Bun's own types (`tsc` runs with Node lib only).
 */
interface BunServerLike {
  port: number
  stop: (closeActiveConnections?: boolean) => void | Promise<void>
}
interface BunGlobal {
  serve: (options: {
    port?: number
    hostname?: string
    fetch: (request: Request, server: BunServerLike) => Response | undefined | Promise<Response | undefined>
    websocket?: unknown
  }) => BunServerLike
}

/** Structural view of `Deno.serve`, for the same reason. */
interface DenoServerLike {
  addr: { port: number, hostname: string }
  shutdown: () => Promise<void>
}
interface DenoGlobal {
  serve: (
    options: { port?: number, hostname?: string, onListen?: (addr: { port: number }) => void },
    handler: (request: Request, info: unknown) => Response | Promise<Response>,
  ) => DenoServerLike
}

/**
 * Whether a request is a WebSocket upgrade aimed at `path` — the `fetch`-side
 * equivalent of the Node transport's `upgrade`-event path filter, used by the
 * native ({@link bindNativeHttpAndWs}) tiers to route only the RPC route to
 * the socket and leave every other request to the h3 app.
 */
function isWsUpgradeRequest(request: Request, path: string | undefined): boolean {
  if ((request.headers.get('upgrade') ?? '').toLowerCase() !== 'websocket')
    return false
  if (!path)
    return true
  try {
    return samePath(new URL(request.url).pathname, path)
  }
  catch {
    return false
  }
}

/**
 * The Bun/Deno counterpart to {@link bindHttpAndWs}: own and listen on a
 * native `fetch`-upgrade server (`Bun.serve` / `Deno.serve`) with crossws's
 * Bun/Deno adapter driving the RPC socket, since crossws's Node adapter (and
 * the `node:http` `upgrade` event it needs) refuses to run off Node. Only the
 * owns-a-server tiers reach here — a shared foreign `node:http` server can't be
 * re-hosted on a native runtime, so that path falls back to SSE instead.
 */
async function bindNativeHttpAndWs(
  runtime: 'bun' | 'deno',
  options: BindHttpAndWsOptions,
): Promise<StartedServer> {
  const { context, port, core } = options
  const bindHost = options.host
  const app = new H3App()
  const rpcHost = context.rpc as unknown as RpcFunctionsHostImpl
  const wsPath = options.path

  const fail = async (closeWs: () => Promise<void>, error: unknown): Promise<never> => {
    await closeWs().catch(() => {})
    throw diagnostics.DF0052({
      host: bindHost,
      port,
      reason: error instanceof Error ? error.message : String(error),
      cause: error,
    })
  }

  let resolvedPort: number
  let closeWs: () => Promise<void>
  let closeServer: () => Promise<void>

  if (runtime === 'bun') {
    const { attachBunWsTransport } = await import('devframe/rpc/transports/ws-bun')
    const tier = await attachBunWsTransport(core, { allowedOrigins: options.allowedOrigins })
    closeWs = tier.close
    const Bun = (globalThis as unknown as { Bun: BunGlobal }).Bun
    let server: BunServerLike
    try {
      server = Bun.serve({
        port,
        hostname: bindHost,
        fetch: async (request, srv) =>
          isWsUpgradeRequest(request, wsPath)
            ? await tier.handleUpgrade(request, srv)
            : await app.fetch(request),
        websocket: tier.websocket,
      })
    }
    catch (error) {
      return await fail(closeWs, error)
    }
    resolvedPort = server.port
    closeServer = async () => {
      await server.stop(true)
    }
  }
  else {
    const { attachDenoWsTransport } = await import('devframe/rpc/transports/ws-deno')
    const tier = await attachDenoWsTransport(core, { allowedOrigins: options.allowedOrigins })
    closeWs = tier.close
    const Deno = (globalThis as unknown as { Deno: DenoGlobal }).Deno
    let server: DenoServerLike
    try {
      server = Deno.serve(
        // A no-op `onListen` suppresses Deno's default "Listening on…" banner,
        // keeping the transport headless like every other tier.
        { port, hostname: bindHost, onListen: () => {} },
        async (request, info) =>
          isWsUpgradeRequest(request, wsPath)
            ? await tier.handleUpgrade(request, info)
            : await app.fetch(request),
      )
    }
    catch (error) {
      return await fail(closeWs, error)
    }
    resolvedPort = server.addr.port
    closeServer = async () => {
      await server.shutdown()
    }
  }

  const origin = normalizeHttpServerUrl(bindHost, resolvedPort)
  const internal = getInternalContext(context)
  const wsUrl = `ws://${formatHostForUrl(bindHost)}:${resolvedPort}${options.path ?? ''}`
  internal.setWsEndpoint({ url: wsUrl })

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
    ws: undefined,
    rpcGroup: core.rpcGroup,
    connectionMeta,
    async close() {
      // Stop the native server before the WS tier: closing the socket while a
      // peer is mid-disconnect (a client that just sent its close frame)
      // deadlocks `Bun.serve().stop()` and crossws's peer close on Bun.
      // Dropping the server's connections first makes the tier close a no-op.
      await closeServer()
      await closeWs()
      if (getInternalContext(context).wsEndpoint?.url === wsUrl)
        getInternalContext(context).setWsEndpoint(undefined)
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
 * - `disabled` — `ws: false`: no WebSocket at all; clients connect over the
 *   SSE endpoint instead (`backend: 'sse'`).
 */
export type InstanceWsTier = 'sidecar' | 'server' | 'external' | 'unbound' | 'disabled'

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
  /** Explicit WebSocket control — see {@link DevframeWsOptions}. `false` disables the socket (SSE-only). */
  ws?: DevframeWsOptions | false
  /** SSE endpoint control — enabled by default; `false` disables, an object renames the route. */
  sse?: boolean | DevframeSseOptions
  /** Bind host for a side-car WebSocket server. Default: `localhost`. */
  host?: string
  /** Extra WS-upgrade origins beyond the loopback default; `false` disables the gate. */
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  /** Destroy off-route upgrades on a shared `server`. */
  destroyUnmatchedUpgrades?: boolean
  onPeerConnect?: (connection: DevframeRpcConnection, session: DevframeNodeRpcSession) => void
  onPeerDisconnect?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  /**
   * Advertise the WS and SSE routes as base-absolute paths (`<base>__ws` /
   * `<base>__sse`) instead of the base-relative default. A hub serves one
   * meta document from several bases, so its clients need the absolute form
   * to resolve the same endpoints.
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
 * Copy a web `Response` from a fetch-style transport handler onto the h3
 * event's response and return its body — mirroring the MCP route's bridge.
 * Returning the body (a `ReadableStream`, or `''` for an empty one — h3
 * middleware only falls through on `undefined`) terminates the chain with
 * the status/headers set here instead of continuing to the SPA catch-all.
 */
function respondWith(event: H3Event, response: Response): ReadableStream | string {
  event.res.status = response.status
  event.res.statusText = response.statusText
  response.headers.forEach((value, key) => {
    event.res.headers.set(key, value)
  })
  return response.body ?? ''
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

  // Bun and Deno drive WebSockets through a native `fetch`-upgrade server
  // (`Bun.serve` / `Deno.serve`) rather than the `node:http` `upgrade` event
  // crossws's Node adapter needs — that adapter throws on sight anywhere off
  // Node. The tiers where devframe owns its server use the matching native
  // adapter; a shared foreign `node:http` server (the `server` tier) can't be
  // re-hosted, so it falls back to the runtime-agnostic SSE transport.
  const runtime = detectServerRuntime()
  const nativeRuntime = runtime !== 'node'

  const wsDisabled = options.ws === false
  const ws: DevframeWsOptions = options.ws === false ? {} : options.ws ?? {}
  const route = withoutLeadingSlash(ws.route ?? DEVFRAME_WS_ROUTE)
  /** Where an upgrade lands on the host's own origin. */
  const routePath = joinURL(base, route)
  /** What `__connection.json` advertises for a same-origin socket. */
  const advertisedPath = options.absoluteWsPath ? routePath : route
  const sidecarRequested = ws.port != null || ws.sidecar === true
  const tier: InstanceWsTier = wsDisabled
    ? 'disabled'
    : sidecarRequested
      ? 'sidecar'
      : options.server
        ? 'server'
        : ws.url
          ? 'external'
          : 'unbound'

  // The SSE endpoint (on by default) rides the same h3 app that serves
  // `__connection.json`, so a relative advertised path always resolves —
  // whatever host surface reaches the app (owned server, shared server,
  // `handler` / `nodeMiddleware`) serves both. The `external` tier has no
  // local RPC server to ride.
  const sseEnabled = options.sse !== false && tier !== 'external'
  const sseRoute = withoutLeadingSlash(
    (typeof options.sse === 'object' ? options.sse.route : undefined) ?? DEVFRAME_SSE_ROUTE,
  )
  const sseRoutePath = joinURL(base, sseRoute)
  const advertisedSsePath = options.absoluteWsPath ? sseRoutePath : sseRoute

  // The public origin is often unknowable at creation (the host app owns the
  // listener) — derive it from the first request and let the auth banner
  // wait for it, unless the caller pinned one (as a string or a getter).
  let derivedOrigin: string | undefined
  function explicitOrigin(): string | undefined {
    return typeof options.origin === 'function' ? options.origin() : options.origin
  }
  function currentOrigin(): string | undefined {
    return explicitOrigin() || derivedOrigin
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

  /**
   * Consider a request-derived origin candidate for the advertised public
   * origin (which backs the OTP magic link). Delegates the trust decision to
   * {@link validateOriginCandidate}: only a loopback host or an exact
   * `allowedOrigins` match is adopted, so a raw inbound `Host`/URL authority
   * never redirects the credential-bearing link. A dynamic `WsOriginRegistry`
   * or a disabled gate offers no static list, so it passes none and only
   * loopback candidates qualify.
   *
   * Keeps the first-valid-origin behavior: an invalid candidate is ignored
   * without setting `derivedOrigin`, so it neither prints a banner nor
   * registers a poisoned origin, and a later valid candidate can still be
   * adopted. Silent by design — a diagnostic here would let an unauthenticated
   * request amplify log noise.
   */
  function noteOrigin(candidate: string): void {
    if (derivedOrigin === undefined && !explicitOrigin()) {
      const allowed = options.allowedOrigins
      const accepted = validateOriginCandidate(candidate, Array.isArray(allowed) ? allowed : undefined)
      if (accepted !== undefined)
        derivedOrigin = accepted
    }
    maybePrintBanner()
    maybeRegister()
  }

  let started: StartedServer | undefined
  let transport: WsRpcTransport | undefined
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
   * The context's RPC core (birpc group, session lifecycle, auth gate) —
   * one per instance, shared by every transport binding (WS and SSE), so a
   * WS peer and an SSE session live in the same session/broadcast space.
   * Built lazily: an `unbound` host that never wires a transport pays
   * nothing for it, not even the imports. `resolvedAuth` and `ctx` are
   * assigned during `init()` before any caller can reach this.
   */
  let resolvedAuth: boolean | DevframeAuthHandler = false
  let corePromise: Promise<ContextRpcServer> | undefined
  function ensureCore(): Promise<ContextRpcServer> {
    corePromise ??= import('./rpc-core').then(({ createContextRpcServer }) => createContextRpcServer({
      context: ctx,
      auth: resolvedAuth,
      onPeerConnect: options.onPeerConnect,
      onPeerDisconnect: options.onPeerDisconnect,
    }))
    return corePromise
  }

  /**
   * The SSE transport, built on the first request to its route so an
   * instance nobody dials over SSE never loads it.
   */
  let ssePromise: Promise<SseRpcTransport> | undefined
  function ensureSse(): Promise<SseRpcTransport> {
    ssePromise ??= (async () => {
      const [core, { attachSseRpcTransport }] = await Promise.all([
        ensureCore(),
        import('devframe/rpc/transports/sse-server'),
      ])
      return attachSseRpcTransport(core.rpcGroup, {
        allowedOrigins: options.allowedOrigins,
        onConnected: core.onConnected,
        onDisconnected: core.onDisconnected,
      })
    })()
    return ssePromise
  }

  /**
   * A side-car server on its own port. `getPort` probes and the bind can
   * still race (or disagree across the v4/v6 duals of `localhost`), so an
   * auto-port side-car retries on a fresh random port instead of failing
   * init; a pinned `ws.port` is honored as given and fails loudly.
   */
  async function startSidecar(core: ContextRpcServer): Promise<StartedServer> {
    const sidecarHost = options.host ?? 'localhost'
    const start = (port: number): Promise<StartedServer> => {
      const bindOptions: BindHttpAndWsOptions = {
        context: ctx,
        core,
        host: sidecarHost,
        port,
        path: withLeadingSlash(route),
        allowedOrigins: options.allowedOrigins,
      }
      // A side-car is devframe's own dedicated server, so on Bun/Deno it binds
      // the native adapter for a real WebSocket; on Node it takes crossws's
      // Node adapter over a `node:http` server.
      return nativeRuntime
        ? bindNativeHttpAndWs(runtime as 'bun' | 'deno', bindOptions)
        : bindHttpAndWs(bindOptions)
    }
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
    resolvedAuth = tier === 'external' ? false : resolveAuth()
    let websocketMeta: ConnectionMeta['websocket'] | undefined
    // Whether a WebSocket transport is actually reachable for this tier on
    // this runtime. It drops to `false` only when a shared foreign `node:http`
    // server would need crossws's Node adapter on Bun/Deno — there the socket
    // gives way to SSE below.
    let wsAvailable = !wsDisabled
    if (tier === 'sidecar') {
      started = await startSidecar(await ensureCore())
      websocketMeta = { port: started.port, path: route }
    }
    else if (tier === 'server') {
      if (nativeRuntime && !ws.url) {
        // crossws's Node adapter can't attach to the host's foreign
        // `node:http` server on Bun/Deno, and that server isn't ours to
        // re-host natively — fall back to SSE (mounted below on the shell's
        // own app). Build the RPC core now so the SSE transport shares it,
        // and expose a WS-less `StartedServer` so adapters that read
        // `internals.started` (e.g. `createDevServer`) keep working.
        const core = await ensureCore()
        wsAvailable = false
        started = {
          origin: currentOrigin() ?? '',
          port: 0,
          app,
          ws: undefined,
          rpcGroup: core.rpcGroup,
          connectionMeta: () => meta ?? options.onMetaUnavailable(),
          close: async () => {},
        }
      }
      else {
        // Shared upgrade on the host's own server at `<base><route>` — zero
        // extra ports, proxy/HTTPS friendly.
        started = await bindHttpAndWs({
          context: ctx,
          core: await ensureCore(),
          host: options.host ?? 'localhost',
          port: 0,
          server: options.server,
          path: routePath,
          allowedOrigins: options.allowedOrigins,
          destroyUnmatched: options.destroyUnmatchedUpgrades,
        })
        websocketMeta = { path: advertisedPath }
      }
    }
    else if (tier === 'external') {
      websocketMeta = ws.url!
    }
    else if (tier === 'unbound') {
      websocketMeta = { path: advertisedPath }
    }
    if (!wsDisabled && ws.url)
      websocketMeta = ws.url

    // The SSE endpoint rides the shell's own app — the same one serving
    // `__connection.json` — so every HTTP-backed tier gets it through its
    // existing surface (owned server, shared server, `handler` /
    // `nodeMiddleware`), and the transport only loads on first use.
    if (sseEnabled) {
      app.use(sseRoutePath, defineHandler(async event =>
        respondWith(event, await (await ensureSse()).handler(event.req))))
    }

    // A shared-server WS binding that fell back is only truly transportless
    // when SSE is off too — surface that so a Bun/Deno host knows to keep SSE
    // enabled (or move the socket to a side-car).
    if (!wsDisabled && !wsAvailable && !sseEnabled)
      diagnostics.DF0075({ runtime }, { method: 'warn' })

    meta = {
      backend: (!wsDisabled && wsAvailable) ? 'websocket' : (sseEnabled ? 'sse' : 'none'),
      ...(wsAvailable && websocketMeta !== undefined ? { websocket: websocketMeta } : {}),
      ...(sseEnabled ? { sse: { path: advertisedSsePath } } : {}),
      ...(result.mcp ? { mcp: result.mcp } : {}),
    }

    // Whatever `setup(ctx)` wrote to `ctx.staticConfig` during
    // `options.init(api)` — e.g. a hub aggregating each installed devframe's
    // own dock-bar preferences — is in by now; bake it into the meta
    // `options.mount` (and every host that re-serves this same meta at
    // another base) publishes.
    if (Object.keys(ctx.staticConfig).length > 0)
      meta.configs = ctx.staticConfig

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
      const [core, { attachWsRpcTransport }] = await Promise.all([
        ensureCore(),
        import('devframe/rpc/transports/ws-server'),
      ])
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
    if (tier === 'disabled')
      throw diagnostics.DF0057()
    if (tier === 'external')
      throw diagnostics.DF0056({ url: ws.url! })
    if (tier !== 'unbound')
      throw diagnostics.DF0055({ tier })
    // `attach` / `handleUpgrade` hand a raw `node:http` socket to crossws's
    // Node adapter, which refuses to run on Bun/Deno. Those runtimes serve WS
    // through a native `fetch`-upgrade server instead: answer the advertised
    // `__ws` route with `attach{Bun,Deno}WsTransport` from `Bun.serve` /
    // `Deno.serve`, or connect over SSE.
    if (nativeRuntime)
      throw diagnostics.DF0076({ runtime })
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
      getInternalContext(ctx).setWsEndpoint({
        url: `ws://${formatHostForUrl(host)}:${address.port}${routePath}`,
      })
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
      await ssePromise?.then(live => live.close()).catch(() => {})
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
