import type { DevframeRpcConnection, WsOriginRegistry } from 'devframe/rpc/transports/ws-server'
import type { ConnectionMeta, DevframeNodeContext, DevframeNodeRpcSession, DevframeNodeRpcSessionMeta, DevframeStorageScope } from 'devframe/types'
import type { Buffer } from 'node:buffer'
import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { DevframeAuthHandler } from '../node/auth/handler'
import type { DevframeInstanceRecord } from '../node/instance-registry'
import type { InstanceShellInternals, StartedServer } from '../node/instance-shell'
import type { DevframeDefinition, DevframeSetupInfo, DevframeSseOptions, DevframeWsOptions, McpRouteOptions } from '../types/devframe'
import type { StaticAssetsSource } from '../types/remote-assets'
import process from 'node:process'
import { resolveStaticAssetsSource } from 'devframe/utils/remote-assets'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { H3 } from 'h3'
import { resolve } from 'pathe'
import { joinURL } from 'ufo'
import { resolveClientAssets } from '../client-assets'
import { DEVFRAME_CONNECTION_META_FILENAME } from '../constants'
import { createHostContext } from '../node/context'
import { diagnostics } from '../node/diagnostics'
import { createH3DevframeHost } from '../node/host-h3'
import { importRuntimeModule } from '../node/import-runtime-module'
import { createInstanceShell, resolveInstanceRegister } from '../node/instance-shell'
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
   * Override the definition's `clientAssets` (or deprecated `cli.distDir`).
   * When neither is set — or `false` is passed to suppress the definition's
   * own client assets — the handler runs in **bridge mode**: only
   * `__connection.json`, the WS endpoint, and the MCP route (when enabled) are
   * served; the SPA is hosted elsewhere.
   */
  distDir?: StaticAssetsSource | false
  /**
   * Share the host's `node:http` server for the WebSocket RPC endpoint: the
   * upgrade listener binds to `<base>__ws` on this server, so no extra port
   * is needed and the socket follows the app through proxies/HTTPS. Hosts
   * whose handlers never see upgrades (Next.js route handlers, Nitro,
   * Rsbuild) ask for a side-car instead with `ws: { sidecar: true }`; hosts
   * that own their upgrade routing wire {@link DevframeInstance.attach} /
   * {@link DevframeInstance.handleUpgrade} themselves.
   */
  server?: NodeHttpServer
  /**
   * Explicit control over how the browser reaches the RPC WebSocket —
   * advertised in `__connection.json`. The **local binding** resolves in
   * precedence order `ws.port` (pinned side-car) > `server` (shared upgrade)
   * > `ws.sidecar` (auto-port side-car) > none (the host drives the socket
   * through {@link DevframeInstance.attach}). `ws.url` controls the
   * advertisement* only: the browser dials it verbatim (a tunnel/relay),
   * while the local binding keeps following the options above — and on its
   * own it means an external server owns both the transport and its auth.
   * Pass `false` to serve no WebSocket at all — clients connect over the
   * SSE endpoint instead (`backend: 'sse'`).
   */
  ws?: DevframeWsOptions | false
  /**
   * SSE RPC endpoint control — enabled by default at `<base>__sse` as the
   * more portable transport alongside the WebSocket. Pass `false` to
   * disable, or a {@link DevframeSseOptions} to rename the route.
   */
  sse?: boolean | DevframeSseOptions
  /**
   * Bind host for a side-car WebSocket server (default: `def.cli?.host ??
   * 'localhost'`). Irrelevant for the `server` / `ws.url` tiers.
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
   * Public origin the host app is reachable at (e.g. `http://localhost:3000`),
   * or a getter for hosts that resolve it late. Backs the auth banner's magic
   * link and absolute dock URLs. When omitted (or the getter returns a falsy
   * value), it is derived from a served request — but only when that request's
   * own origin is loopback or exactly matches an `allowedOrigins` entry; a raw
   * inbound `Host`/URL authority and forwarded headers are never adopted. Set
   * this explicitly for a non-loopback deployment (proxy, LAN, public host).
   */
  origin?: string | (() => string)
  /**
   * Publish this instance in the global registry (`~/.devframe/instances/`)
   * so discovery tooling (`devframe connect`, the inspect plugin's Instances
   * tab) finds it without port guessing. Registration is a dynamic import
   * that fires once the public origin resolves and is torn down on
   * {@link DevframeInstance.close}. Defaults to off; pass `true` to enable, or
   * an object to override individual record fields (`id`, `name`, `mcp`, …).
   */
  register?: boolean | Partial<DevframeInstanceRecord>
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
   * Called once per new RPC connection, right after its session is created.
   * Forwarded verbatim to the underlying transport.
   */
  onPeerConnect?: (connection: DevframeRpcConnection, session: DevframeNodeRpcSession) => void
  /**
   * Called once per closed RPC connection, right after the transport's own
   * disconnect bookkeeping runs.
   */
  onPeerDisconnect?: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
}

export interface DevframeInstance {
  /**
   * The normalized mount base this instance answers under (leading and
   * trailing slash, e.g. `/__my-tool/`). Reference it when wiring the mount
   * — route guards, middleware path checks — instead of repeating the
   * string.
   */
  base: string
  /**
   * Web-standard request handler — mount it on a catch-all route under
   * {@link DevframeInstance.base} (Next.js route handler, SvelteKit
   * `+server.ts`, Hono `c.req.raw`, Nitro `toWebRequest(event)`, …).
   * Requests outside the base 404.
   */
  handler: (request: Request) => Promise<Response>
  /**
   * Connect/Express-style middleware over the same surface — for
   * `viteServer.middlewares.use(handler.nodeMiddleware)` or any other
   * node middleware stack. Mount it un-prefixed: paths outside the base
   * call `next()` so the rest of the stack keeps working.
   */
  nodeMiddleware: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void
  /**
   * Route a host server's `upgrade` events to the RPC socket, returning a
   * detach function — the manual counterpart to the `server` option, for
   * hosts that get their `node:http` server only after the instance exists.
   * Available on the default tier; a configured transport (`server`,
   * `ws.port`, `ws.sidecar`, `ws.url`) already owns the socket and reports
   * `DF0055` / `DF0056` instead.
   */
  attach: (server: NodeHttpServer) => () => void
  /**
   * Complete a single `upgrade` event on the RPC socket, for hosts that
   * already own an `upgrade` listener: `server.on('upgrade',
   * instance.handleUpgrade)`. Same availability as
   * {@link DevframeInstance.attach}.
   */
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void
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
  /** Tear down: WS transport/side-car, MCP sessions. */
  close: () => Promise<void>
}

/**
 * Live internals of a handler, for the first-party adapters built on it
 * (`createDevServer` exposes the transport's `ws`/`rpcGroup` through its
 * `StartedServer` contract).
 *
 * @internal
 */
export interface DevframeInstanceInternals {
  /** The bound HTTP+WS server handle backing the side-car / shared-server WS tiers. */
  readonly started?: StartedServer
  /** The resolved auth handler when the gate is active. */
  readonly authHandler?: DevframeAuthHandler
}

const INSTANCE_INTERNALS = new WeakMap<object, InstanceShellInternals>()

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
 * `handler`/`nodeMiddleware` await readiness internally. Nothing binds a port
 * on its own: the WebSocket resolves in precedence order — `ws.port` (pinned
 * side-car) > `server` (shared upgrade at `<base>__ws`) > `ws.sidecar`
 * (auto-port side-car) > the host driving upgrades itself through
 * {@link DevframeInstance.attach} — while `ws.url`, when set, overrides the
 * advertised* endpoint (the tunnel pattern) and on its own hands the whole
 * transport to an external server. `__connection.json` reflects whichever
 * combination is active.
 */
export function initDevframe(
  def: DevframeDefinition,
  options: InitDevframeOptions,
): DevframeInstance {
  const base = normalizeBasePath(options.base)
  const distDir = options.distDir === false ? undefined : options.distDir ?? resolveClientAssets(def)
  const app = options.app ?? new H3()
  const host = options.host ?? def.cli?.host ?? 'localhost'

  const shell = createInstanceShell<DevframeNodeContext>({
    base,
    app,
    host,
    origin: options.origin,
    // Auth resolution mirrors `createDevServer`: gate by default, explicit
    // `false` opts out, a handler object installs a custom scheme.
    auth: options.auth !== undefined ? options.auth : def.cli?.auth,
    server: options.server,
    ws: options.ws ?? def.cli?.ws,
    sse: options.sse ?? def.cli?.sse,
    allowedOrigins: options.allowedOrigins,
    destroyUnmatchedUpgrades: options.destroyUnmatchedUpgrades,
    onPeerConnect: options.onPeerConnect,
    onPeerDisconnect: options.onPeerDisconnect,
    register: resolveInstanceRegister(options.register, { id: def.id, name: def.name }),
    resolveSidecarPort: sidecarHost => resolveDevServerPort(def, { host: sidecarHost }),
    onMetaUnavailable: () => {
      throw diagnostics.DF0054({ id: def.id })
    },

    async init(api) {
      const h3Host = createH3DevframeHost({
        origin: () => api.origin() ?? 'http://localhost',
        appName: def.id,
        mount: (mountBase, dir) => {
          mountStaticHandler(app, mountBase, dir)
        },
      })
      const hostImpl = options.getStorageDir
        ? { ...h3Host, getStorageDir: options.getStorageDir }
        : h3Host
      const context = await createHostContext({
        cwd: process.cwd(),
        mode: 'dev',
        host: hostImpl,
        importMetaUrl: def.importMetaUrl,
      })
      const setupInfo: DevframeSetupInfo = { flags: options.flags ?? {} }
      // Wire services are constructed and made ready BEFORE setup, so
      // `setup(ctx)` can consume them synchronously (`ctx.services.get`).
      for (const input of def.services ?? [])
        void context.services.install(input, { resolveFrom: def.importMetaUrl })
      await context.services.ready()
      await def.setup(context, setupInfo)

      // Route-based MCP server (opt-in). Mounted before the SPA static
      // catch-all so the exact `<base>__mcp` route wins, and advertised in
      // `__connection.json`. The MCP SDK stays an optional peer — its code is
      // only pulled in (dynamically) when the route is enabled.
      const mcpOption = options.mcp ?? def.cli?.mcp
      const mcpMeta = resolveMcpConnectionMeta(def, mcpOption)
      let mcpDispose: (() => Promise<void>) | undefined
      if (mcpMeta) {
        const mcpConfig = mcpOption === true || mcpOption === undefined ? {} : mcpOption as McpRouteOptions
        const mcpPath = joinURL(base, mcpMeta.path)
        let mountMcpHttp: typeof import('./mcp/http').mountMcpHttp
        try {
          ;({ mountMcpHttp } = await importRuntimeModule<typeof import('./mcp')>('devframe/adapters/mcp'))
        }
        catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          throw diagnostics.DF0017({ transport: 'http', reason, cause: error })
        }
        const mounted = mountMcpHttp(app, context, mcpPath, {
          serverName: `${def.id} (devframe)`,
          serverVersion: def.version ?? '0.0.0',
          exposeSharedState: true,
          allowedOrigins: mcpConfig.allowedOrigins,
        })
        mcpDispose = mounted.dispose
      }

      return {
        context,
        ...(mcpMeta ? { mcp: mcpMeta } : {}),
        ...(mcpDispose ? { dispose: mcpDispose } : {}),
      }
    },

    mount(context, meta) {
      // Discovery meta before the SPA mount so its SPA-fallback can't swallow
      // the route; both sit at the SPA root for relative `./__connection.json`
      // fetches.
      app.use(joinURL(base, DEVFRAME_CONNECTION_META_FILENAME), () => meta)

      if (distDir) {
        const source = resolveStaticAssetsSource(distDir, context.host.getStorageDir('project'), def.importMetaUrl)
        mountStaticHandler(app, base, typeof source === 'string' ? resolve(source) : source)
      }
    },
  })

  const instance: DevframeInstance = {
    base: shell.base,
    handler: shell.handler,
    nodeMiddleware: shell.nodeMiddleware,
    attach: shell.attach,
    handleUpgrade: shell.handleUpgrade,
    ready: shell.ready,
    context: shell.context,
    connectionMeta: shell.connectionMeta,
    close: shell.close,
  }
  INSTANCE_INTERNALS.set(instance, shell.internals)
  return instance
}
