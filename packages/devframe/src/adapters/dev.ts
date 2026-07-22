import type { DevframeAuthHandler } from '../node/auth/handler'
import type { StartedServer } from '../node/server'
import type { ConnectionMeta } from '../types/context'
import type { DevframeDefinition, DevframeSetupInfo, DevframeWsOptions, McpRouteOptions } from '../types/devframe'
import process from 'node:process'
import { open } from 'devframe/utils/open'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3 } from 'h3'
import { resolve } from 'pathe'
import { joinURL, withBase, withLeadingSlash, withoutLeadingSlash } from 'ufo'
import { DEVFRAME_CONNECTION_META_FILENAME, DEVFRAME_MCP_ROUTE, DEVFRAME_WS_ROUTE } from '../constants'
import { createHostContext } from '../node/context'
import { diagnostics } from '../node/diagnostics'
import { createH3DevframeHost } from '../node/host-h3'
import { startHttpAndWs } from '../node/server'
import { normalizeHttpServerUrl } from '../node/utils'
import { createInteractiveAuth } from '../recipes/interactive-auth'
import { normalizeBasePath, resolveBasePath } from './_shared'

const DEFAULT_PORT = 9999

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
   * Expose a route-based MCP server on the dev server (Streamable-HTTP).
   * Overrides `def.cli?.mcp`; `undefined` falls through to it. `false`
   * disables the route regardless of the definition default. See
   * {@link McpRouteOptions}.
   */
  mcp?: boolean | McpRouteOptions
  /**
   * Called once the WS server is bound. Devframe stays headless
   * otherwise — wire this if you want a startup banner.
   */
  onReady?: (info: { origin: string, port: number, app: H3 }) => void | Promise<void>
}

export interface ResolveDevServerPortOptions {
  /** Bind host (passed to `get-port-please` for in-use detection). */
  host?: string
  /** Override the preferred port. Default: `def.cli?.port ?? 9999`. */
  defaultPort?: number
}

/**
 * Resolve the listening port for {@link createDevServer}, honoring the
 * definition's `cli.port` / `cli.portRange` / `cli.random` settings.
 * Exposed separately so authors who run their own argv parsing can
 * resolve a port up-front (to print it, log it, etc.) before starting
 * the server.
 */
export async function resolveDevServerPort(
  def: DevframeDefinition,
  options: ResolveDevServerPortOptions = {},
): Promise<number> {
  const host = options.host ?? def.cli?.host ?? 'localhost'
  const port = options.defaultPort ?? def.cli?.port ?? DEFAULT_PORT
  // Only include optional fields when set — `get-port-please` spreads
  // user options over its defaults, so `portRange: undefined` would
  // wipe out the internal `[]` and crash on iteration.
  const portOptions: Parameters<typeof getPort>[0] = { port, host }
  if (def.cli?.portRange)
    portOptions.portRange = def.cli.portRange
  if (def.cli?.random)
    portOptions.random = def.cli.random
  return getPort(portOptions)
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
  const distDir = options.distDir ?? def.cli?.distDir

  const host = options.host ?? def.cli?.host ?? 'localhost'
  const port = options.port ?? await resolveDevServerPort(def, { host })
  const flags = options.flags ?? {}
  const basePath = options.basePath ? normalizeBasePath(options.basePath) : resolveBasePath(def, 'standalone')
  const app = options.app ?? new H3()
  // A wildcard bind host (`0.0.0.0` / `::`) isn't dialable from a browser, so
  // advertise a loopback origin for anything that hands a client an absolute URL.
  const origin = normalizeHttpServerUrl(host, port)

  const h3Host = createH3DevframeHost({
    origin,
    appName: def.id,
    mount: (base, dir) => {
      mountStaticHandler(app, base, dir)
    },
  })

  const ctx = await createHostContext({
    cwd: process.cwd(),
    mode: 'dev',
    host: h3Host,
  })
  const setupInfo: DevframeSetupInfo = { flags }
  await def.setup(ctx, setupInfo)

  // Route-based MCP server (opt-in via `cli.mcp` / the `mcp` option). Mounted
  // before the SPA static catch-all so the exact `/__mcp` route wins, and
  // advertised in `__connection.json` so in-browser tooling can discover it.
  // The MCP SDK is an optional peer dep, so its code is only pulled in
  // (dynamically) when the route is enabled.
  const mcpConfig = resolveMcpConfig(options.mcp ?? def.cli?.mcp)
  let mcpDispose: (() => Promise<void>) | undefined
  let mcpMeta: ConnectionMeta['mcp']
  if (mcpConfig) {
    const mcpRoute = withoutLeadingSlash(mcpConfig.path ?? DEVFRAME_MCP_ROUTE)
    const mcpPath = joinURL(basePath, mcpRoute)
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
    mcpMeta = { path: mcpRoute }
  }

  // Connection meta — the SPA fetches this to discover the RPC backend. How
  // the WS endpoint is bound and advertised follows the resolved ws config:
  // a same-origin route (default, proxy-safe), a dedicated port, or a remote
  // origin. Both files sit at the SPA root so the deployed SPA discovers them
  // via relative `./__connection.json` / `./<route>` fetches.
  const { bindPath, wsPort, meta } = resolveWsConnection(def, options, basePath)
  const connectionMetaPath = joinURL(basePath, DEVFRAME_CONNECTION_META_FILENAME)
  app.use(connectionMetaPath, () => ({
    backend: 'websocket',
    websocket: meta,
    ...(mcpMeta ? { mcp: mcpMeta } : {}),
  }))

  if (distDir)
    mountStaticHandler(app, basePath, resolve(distDir))

  // Resolve authentication. The standalone dev server gates by default: when
  // the author leaves `auth` unset (or `true`), auto-wire devframe's
  // interactive OTP handler and print its code + magic-link banner once the
  // server is listening (a gate is useless without surfacing the code). A
  // `false` (including the `--no-auth` flag) opts out; a handler object is
  // passed straight through to `startHttpAndWs`.
  const authOption = flags.auth === false ? false : def.cli?.auth
  let authHandler: DevframeAuthHandler | undefined
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

  const started = await startHttpAndWs({
    context: ctx,
    host,
    port,
    app,
    path: bindPath,
    wsPort,
    auth: resolvedAuth,
    onReady: async (info) => {
      // Print the auth banner before the caller's own onReady / browser open
      // so the code is on screen by the time a browser lands on the page.
      authHandler?.printBanner()
      await options.onReady?.(info)
      await maybeOpenBrowser(def, flags, `${info.origin}${basePath}`, options.openBrowser, authHandler)
    },
  })

  // Fold MCP session teardown into the server's close so callers get a single
  // graceful-shutdown handle.
  if (mcpDispose) {
    const closeServer = started.close
    started.close = async () => {
      await mcpDispose!()
      await closeServer()
    }
  }

  return started
}

/**
 * Normalize the `cli.mcp` / `mcp` option (`boolean | McpRouteOptions`) into
 * concrete options, or `undefined` when the MCP route is disabled.
 */
function resolveMcpConfig(mcp: boolean | McpRouteOptions | undefined): McpRouteOptions | undefined {
  if (!mcp)
    return undefined
  return mcp === true ? {} : mcp
}

/**
 * Resolve the three WS connection scenarios from the definition / call-site
 * config into a concrete server bind path, optional dedicated port, and the
 * `__connection.json` descriptor the browser resolves.
 */
function resolveWsConnection(
  def: DevframeDefinition,
  options: CreateDevServerOptions,
  basePath: string,
): { bindPath: string, wsPort: number | undefined, meta: ConnectionMeta['websocket'] } {
  const ws = options.ws ?? def.cli?.ws ?? {}
  // Normalize the route to a bare segment; the meta carries it relative so the
  // client resolves it against its own origin (proxy-safe).
  const route = withoutLeadingSlash(ws.route ?? DEVFRAME_WS_ROUTE)

  // (3) Remote origin — host the socket locally on the shared route, but tell
  // the browser to dial the fully-qualified endpoint (a tunnel/relay) verbatim.
  if (ws.url)
    return { bindPath: joinURL(basePath, route), wsPort: undefined, meta: ws.url }

  // (2) Different port — a standalone socket server on its own port, rooted at
  // `/<route>`. The client targets `ws(s)://<page-host>:<port>/<route>`.
  if (ws.port != null)
    return { bindPath: withLeadingSlash(route), wsPort: ws.port, meta: { port: ws.port, path: route } }

  // (1) Same server, different route (default) — share the HTTP port; advertise
  // a relative same-origin path.
  return { bindPath: joinURL(basePath, route), wsPort: undefined, meta: { path: route } }
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
