import type { Peer } from 'crossws'
import type { DevframeAuthHandler } from '../node/auth/handler'
import type { StartedServer } from '../node/server'
import type { DevframeDefinition, DevframeWsOptions, McpRouteOptions } from '../types/devframe'
import type { DevframeNodeRpcSession, DevframeNodeRpcSessionMeta } from '../types/rpc'
import { createServer } from 'node:http'
import process from 'node:process'
import { open } from 'devframe/utils/open'
import { H3, toNodeHandler } from 'h3'
import { joinURL, withBase, withoutLeadingSlash } from 'ufo'
import { DEVFRAME_MCP_ROUTE } from '../constants'
import { diagnostics } from '../node/diagnostics'
import { registerDevframeInstance } from '../node/instance-registry'
import { normalizeHttpServerUrl } from '../node/utils'
import { normalizeBasePath, resolveBasePath, resolveDevServerPort, resolveMcpConfig } from './_shared'
import { getInstanceInternals, initDevframe } from './initiate'

export { resolveDevServerPort, resolveMcpConnectionMeta } from './_shared'
export type { ResolveDevServerPortOptions } from './_shared'

export interface CreateDevServerOptions {
  /** Bind host. Default: `def.cli?.host ?? 'localhost'`. */
  host?: string
  /**
   * Port to listen on. When omitted, falls back to
   * {@link resolveDevServerPort}, which respects `def.cli?.port` /
   * `portRange` / `random`.
   */
  port?: number
  /**
   * Parsed flag bag forwarded to `setup(ctx, { flags })`. The dev
   * server itself only reads `flags.open` from this bag, and only when
   * {@link CreateDevServerOptions.openBrowser} is left undefined.
   */
  flags?: Record<string, unknown>
  /**
   * Override `def.cli?.distDir`. When neither this option nor
   * `def.cli?.distDir` is set, the dev server runs in **bridge mode** —
   * only `__connection.json` and the WS endpoint are mounted; the SPA
   * is expected to be hosted elsewhere (e.g. by a parent Vite/Nuxt
   * dev server via `viteDevBridge({ devMiddleware })`).
   */
  distDir?: string
  /**
   * Override the SPA mount path. Defaults to
   * `resolveBasePath(def, 'standalone')` (i.e. `def.basePath` or `/`).
   */
  basePath?: string
  /**
   * Override how the browser reaches the RPC WebSocket (`def.cli?.ws`).
   * See {@link DevframeWsOptions}: same-server route (default), a dedicated
   * port, or a remote origin.
   */
  ws?: DevframeWsOptions
  /**
   * h3 app to mount the SPA + connection-meta routes on. When omitted
   * a fresh app is created. Pass a pre-configured app to attach custom
   * middleware (auth, logging, extra static assets) before devframe's
   * own handlers.
   */
  app?: H3
  /**
   * Auto-open the browser. When `undefined` the resolution falls
   * through to `flags.open` (incl. string path) and finally
   * `def.cli?.open`. `false` disables the open regardless of the other
   * sources; a string opens that relative path.
   */
  openBrowser?: boolean | string
  /**
   * Override how authentication resolves, taking precedence over
   * `def.cli?.auth`. Pass `false` to skip the gate entirely (the standard
   * choice for a **hosted** deployment where the host manages auth — see
   * {@link viteDevBridge}); a {@link DevframeAuthHandler} to install a custom
   * scheme; or `true` to force devframe's interactive OTP gate on. When
   * omitted, auth resolves from `flags.auth` / `def.cli?.auth` (the standalone
   * default: gated). The `--no-auth` flag (`flags.auth === false`) still forces
   * the gate off regardless of this option.
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Expose a route-based MCP server on the dev server (Streamable-HTTP).
   * Overrides `def.cli?.mcp`; `undefined` falls through to it. `false`
   * disables the route regardless of the definition default. See
   * {@link McpRouteOptions}.
   */
  mcp?: boolean | McpRouteOptions
  /**
   * Called once per new WS connection, right after its session is created.
   * Forwarded verbatim to the underlying `startHttpAndWs`.
   */
  onPeerConnect?: (peer: Peer, session: DevframeNodeRpcSession) => void
  /**
   * Called once per closed WS connection, right after its session's
   * disconnect bookkeeping runs. Forwarded verbatim to the underlying
   * `startHttpAndWs`.
   */
  onPeerDisconnect?: (peer: Peer, meta: DevframeNodeRpcSessionMeta) => void
  /**
   * Called once the WS server is bound. Devframe stays headless
   * otherwise — wire this if you want a startup banner.
   */
  onReady?: (info: { origin: string, port: number, app: H3 }) => void | Promise<void>
}

/**
 * Start a devframe dev server for a {@link DevframeDefinition} —
 * h3 + WebSocket RPC + (optionally) the author's SPA mounted at the
 * resolved base path.
 *
 * When `distDir` is omitted (and `def.cli?.distDir` is unset) the
 * server runs in **bridge mode**: only `__connection.json` and the WS
 * endpoint are mounted, with no SPA mount. The SPA is expected to be
 * hosted elsewhere (e.g. by a parent Vite/Nuxt dev server) — see
 * `viteDevBridge({ devMiddleware })`.
 *
 * Returns the underlying {@link StartedServer} handle so callers can
 * close it gracefully (SIGINT, hot-reload, test teardown).
 *
 * Use this directly when integrating devframe into an existing CLI
 * framework (commander, yargs, hand-rolled CAC). For the all-in-one
 * `dev` / `build` / `mcp` shell, reach for {@link createCac} instead.
 */
export async function createDevServer(
  def: DevframeDefinition,
  options: CreateDevServerOptions = {},
): Promise<StartedServer> {
  const host = options.host ?? def.cli?.host ?? 'localhost'
  const requestedPort = options.port ?? await resolveDevServerPort(def, { host })
  const flags = options.flags ?? {}
  const basePath = options.basePath ? normalizeBasePath(options.basePath) : resolveBasePath(def, 'standalone')
  const app = options.app ?? new H3()

  // The dev server is `initDevframe` plus a node listener: the instance owns
  // the whole surface (setup, MCP, meta, SPA, WS binding, auth), mounted on
  // this server's app; listening starts first so the shared WS tier — and
  // the advertised origin — reflect the real bound port (`port: 0` binds an
  // ephemeral one).
  const server = createServer(toNodeHandler(app))
  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      const onError = (error: Error): void => rejectListen(error)
      // Without this listener a failed bind emits `error` with nobody
      // attached — an uncaughtException — and the `listen` callback never
      // fires, so this promise never settles.
      server.once('error', onError)
      server.listen(requestedPort, host, () => {
        server.removeListener('error', onError)
        resolveListen()
      })
    })
  }
  catch (error) {
    throw diagnostics.DF0052({
      host,
      port: requestedPort,
      reason: error instanceof Error ? error.message : String(error),
      cause: error,
    })
  }
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : requestedPort
  // A wildcard bind host (`0.0.0.0` / `::`) isn't dialable from a browser, so
  // advertise a loopback origin for anything that hands a client an absolute URL.
  const origin = normalizeHttpServerUrl(host, port)

  const devframe = initDevframe(def, {
    base: basePath,
    distDir: options.distDir,
    app,
    server,
    host,
    origin,
    ws: options.ws,
    // The `--no-auth` flag forces the gate off regardless of the `auth`
    // option / definition default (which the instance resolves itself).
    auth: flags.auth === false ? false : options.auth,
    mcp: options.mcp,
    flags,
    onPeerConnect: options.onPeerConnect,
    onPeerDisconnect: options.onPeerDisconnect,
    // This server is devframe's own — nothing else handles its upgrades, so
    // off-route upgrade attempts are rejected promptly.
    destroyUnmatchedUpgrades: true,
  })

  try {
    await devframe.ready
  }
  catch (error) {
    await new Promise<void>(resolveClose => server.close(() => resolveClose()))
    throw error
  }

  const internals = getInstanceInternals(devframe)
  // Every dev-server configuration binds a local transport (`server` is
  // always passed), so the startHttpAndWs handle is always present.
  const transport = internals.started!

  await options.onReady?.({ origin, port, app })
  await maybeOpenBrowser(def, flags, `${origin}${basePath}`, options.openBrowser, internals.authHandler)

  const mcpConfig = resolveMcpConfig(options.mcp ?? def.cli?.mcp)

  // Record the instance in the global registry so discovery tooling
  // (`devframe connect`) finds it without port guessing. Registration never
  // throws; a crash-orphaned record is pruned by readers on a failed probe.
  const registration = registerDevframeInstance({
    pid: process.pid,
    port,
    origin,
    basePath,
    id: def.id,
    name: def.name,
    rootDir: process.cwd(),
    mcp: mcpConfig ? { path: joinURL(basePath, withoutLeadingSlash(mcpConfig.path ?? DEVFRAME_MCP_ROUTE)) } : null,
    startedAt: Date.now(),
  })

  return {
    origin,
    port,
    app,
    ws: transport.ws,
    rpcGroup: transport.rpcGroup,
    connectionMeta: transport.connectionMeta,
    async close() {
      registration.unregister()
      // Instance teardown detaches the WS transport (and closes any
      // dedicated-port socket server) and disposes MCP sessions; the HTTP
      // server is this function's own to close.
      await devframe.close()
      await new Promise<void>(resolveClose => server.close(() => resolveClose()))
    },
  }
}

async function maybeOpenBrowser(
  def: DevframeDefinition,
  flags: Record<string, unknown>,
  origin: string,
  override: boolean | string | undefined,
  authHandler: DevframeAuthHandler | undefined,
): Promise<void> {
  const flagsOpen = flags.open as boolean | string | undefined
  const cliOpen = def.cli?.open
  // Explicit override wins; otherwise CLI flag (`--open` / `--no-open`
  // / `--open path`); finally the definition default.
  const resolved = override ?? flagsOpen ?? cliOpen
  if (resolved === undefined || resolved === false)
    return
  const target = typeof resolved === 'string'
    ? withBase(resolved, origin)
    : origin
  // When the server is auth-gated, let the handler embed a one-time
  // credential (e.g. the OTP query param) in the opened URL so the tab
  // lands already authorized instead of prompting the user.
  const authorizedTarget = authHandler?.buildOpenUrl?.(target) ?? target
  try {
    await open(authorizedTarget)
  }
  catch {
    // Failing to launch a browser shouldn't break the dev server.
    // The user can navigate manually.
  }
}
