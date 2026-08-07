import type { StartedServer } from 'devframe/node'
import type { DevframeAuthHandler } from 'devframe/node/auth'
import type { BunWsTier } from 'devframe/rpc/transports/ws-bun'
import type { WsOriginRegistry } from 'devframe/rpc/transports/ws-server'
import type { ConnectionMeta, DevframeDefinition, DevframeStorageScope, DevframeWsOptions, McpRouteOptions } from 'devframe/types'
import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { ClientScriptEntry } from '../types/docks'
import type { DevframeHubContext } from './context'
import { createReadStream } from 'node:fs'
import process from 'node:process'
import { Readable } from 'node:stream'
import { DEVFRAME_CONNECTION_META_FILENAME, DEVFRAME_DOCK_IMPORTS_FILENAME, DEVFRAME_MCP_ROUTE, DEVFRAME_WS_ROUTE } from 'devframe/constants'
import { createH3DevframeHost, startHttpAndWs } from 'devframe/node'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { getPort } from 'get-port-please'
import { H3, toNodeHandler } from 'h3'
import { resolve } from 'pathe'
import { cleanDoubleSlashes, joinURL, withLeadingSlash, withoutLeadingSlash, withoutTrailingSlash, withTrailingSlash } from 'ufo'
import { createHubContext } from './context'
import { diagnostics } from './diagnostics'
import { mountDevframe } from './mount-devframe'

/** Default mount base for a hub instance — one namespace, one catch-all. */
export const DEVFRAMES_HUB_BASE = '/__devframes/'

/** Content-type for a UI asset key, inferred from its file extension. */
function assetContentType(key: string): string {
  if (key.endsWith('.json'))
    return 'application/json; charset=utf-8'
  if (key.endsWith('.js') || key.endsWith('.mjs'))
    return 'text/javascript; charset=utf-8'
  if (key.endsWith('.css'))
    return 'text/css; charset=utf-8'
  if (key.endsWith('.svg'))
    return 'image/svg+xml'
  if (key.endsWith('.html'))
    return 'text/html; charset=utf-8'
  return 'application/octet-stream'
}

/** Reserved filenames directly under the hub base — a frame id can't shadow them. */
const RESERVED_HUB_PATHS = [
  DEVFRAME_CONNECTION_META_FILENAME,
  DEVFRAME_DOCK_IMPORTS_FILENAME,
  DEVFRAME_WS_ROUTE,
  DEVFRAME_MCP_ROUTE,
  '__index.json',
  'embedded.js',
] as const

/**
 * The UI slot of a hub instance — pure data, zero policy. The hub itself is
 * headless: whoever fills this slot decides what a viewer looks like.
 * `@devframes/hub-ui` ships the reference implementation (`createUi()`);
 * Vite DevTools or any community viewer supplies its own object to the same
 * slot and reuses all the infrastructure.
 */
export interface DevframeHubUi {
  /**
   * A standalone viewer SPA (built with relative asset paths) served at the
   * hub base itself — open `<base>` in a tab and the devtools are there.
   */
  viewer?: {
    /** Directory of the prebuilt viewer SPA. */
    distDir: string
  }
  /**
   * A prebuilt, self-contained script served at `<base>embedded.js` — the
   * floating-devtools bootstrap a host page loads with one
   * `<script type="module" src="<base>embedded.js">` tag. Visibility policy
   * (always-on, keyboard-summoned, …) belongs entirely to this entry.
   */
  embedded?: {
    /** File path of the prebuilt single-file module. */
    entry: string
  }
  /**
   * Extra UI-owned files the hub serves at `<base><key>`, each produced lazily
   * from memory. Keys are base-relative paths (e.g. `branding.json`); the
   * content-type is inferred from the key's extension. A generic seam a viewer
   * uses to publish small runtime documents (the reference UI serves its
   * branding this way) without teaching the hub anything about their meaning.
   */
  assets?: Record<string, () => string | Uint8Array>
}

export interface InitHubOptions {
  /**
   * Mount base the hub answers under. Default: `/__devframes/` — every
   * mounted devframe lives at `<base><id>/`, so the host app needs exactly
   * one catch-all route.
   */
  base?: string
  /**
   * Devframes to mount: each runs its `setup()` against the shared hub
   * context (one merged RPC registry, one WebSocket, one auth gate), serves
   * its SPA at `<base><id>/`, and is auto-registered as an iframe dock.
   */
  devframes?: DevframeDefinition[]
  /**
   * Bring your own hub context instead of `devframes` — for hosts that
   * assemble `createHubContext` + `mountDevframe` themselves (with their own
   * `DevframeHost` serving the frames). The instance then serves only the
   * hub-level endpoints (`__connection.json`, `__index.json`,
   * `__client-imports.js`, the WS transport, MCP, and the `ui` slot);
   * serve each frame's meta yourself from {@link HubInstance.connectionMeta}.
   */
  context?: DevframeHubContext
  /**
   * Runs once the context exists and every `devframes` entry is mounted —
   * register docks, commands, terminals, and messages surfaces here.
   */
  configure?: (ctx: DevframeHubContext) => void | Promise<void>
  /** See {@link DevframeHubUi} — omitted, the hub stays fully headless. */
  ui?: DevframeHubUi
  /**
   * Share the host's `node:http` server for the WebSocket RPC endpoint
   * (upgrade bound at `<base>__ws`). When omitted (and no `ws.url`/`ws.port`
   * is given), an eager side-car WebSocket server starts at init. Under Bun,
   * the default is the fetch-upgrade tier — pass the `Bun.serve` server as
   * `handler`'s second argument and wire {@link HubInstance.websocket}.
   */
  server?: NodeHttpServer
  /**
   * Explicit WebSocket control, same contract as `initDevframe`:
   * `url` overrides the advertisement (tunnel pattern), `port` pins a
   * side-car, `route` renames the upgrade segment (default `__ws`).
   */
  ws?: DevframeWsOptions
  /** Bind host for a side-car WebSocket server. Default: `localhost`. */
  host?: string
  /**
   * The hub's **single Auth**: one gate at the one shared transport covers
   * every mounted frame, the MCP route, and the hub built-ins. Gates by
   * default (devframe's interactive OTP); `false` opts out; a
   * {@link DevframeAuthHandler} installs a custom scheme.
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Expose the **aggregate** MCP endpoint at `<base>__mcp` — one
   * Streamable-HTTP server over the shared context's whole tool registry
   * (ids are already namespaced per plugin). Disabled by default.
   *
   * @experimental
   */
  mcp?: boolean | McpRouteOptions
  /**
   * Memoize the instance on `globalThis` under this key so dev-time module
   * re-evaluation returns the live instance instead of leaking side-car
   * servers (`DF8001` when the options changed).
   */
  key?: string
  /**
   * Public origin the host app is reachable at, or a getter. Derived lazily
   * from the first request when omitted.
   */
  origin?: string | (() => string)
  /** Working directory for the hub context. Default: `process.cwd()`. */
  cwd?: string
  /** Override where persisted devframe state lives. */
  getStorageDir?: (scope: DevframeStorageScope) => string
  /** Extra WS-upgrade origins beyond the loopback default; `false` disables the gate. */
  allowedOrigins?: readonly string[] | WsOriginRegistry | false
  /** Destroy off-route upgrades on a shared `server` devframe's adapter owns outright. */
  destroyUnmatchedUpgrades?: boolean
}

export interface HubInstance {
  /**
   * Web-standard request handler for the whole hub — mount it on one
   * catch-all route under {@link InitHubOptions.base}. Under Bun, pass the
   * `Bun.serve` server as the second argument so WS upgrades complete.
   */
  handler: (request: Request, server?: unknown) => Promise<Response>
  /** Connect/Express-style middleware over the same surface; `next()`s outside the base. */
  nodeMiddleware: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void
  /** `Bun.serve({ websocket })` handlers (active only under the Bun tier). */
  websocket: {
    open: (ws: unknown) => void
    message: (ws: unknown, message: unknown) => void
    close: (ws: unknown, code?: number, reason?: string) => void
    drain: (ws: unknown) => void
  }
  /** Resolves once every frame is mounted and the WebSocket binding is live. */
  ready: Promise<void>
  /** The shared hub context, once initialized. */
  context: Promise<DevframeHubContext>
  /** The `ConnectionMeta` served at `<base>__connection.json` (and every frame base). */
  connectionMeta: () => ConnectionMeta
  /** Tear down: WS transport/side-car, MCP sessions, memo-registry entry. */
  close: () => Promise<void>
}

interface HubRegistryEntry {
  hash: string
  instance: HubInstance
}

const REGISTRY_KEY = Symbol.for('devframes:hub-instance-registry')

function hubRegistry(): Map<string, HubRegistryEntry> {
  const holder = globalThis as { [REGISTRY_KEY]?: Map<string, HubRegistryEntry> }
  holder[REGISTRY_KEY] ??= new Map()
  return holder[REGISTRY_KEY]
}

function optionsHash(options: InitHubOptions): string {
  return JSON.stringify({
    base: options.base,
    devframes: options.devframes?.map(d => d.id),
    context: options.context != null,
    ui: options.ui && {
      viewer: options.ui.viewer?.distDir,
      embedded: options.ui.embedded?.entry,
    },
    server: options.server != null,
    ws: options.ws,
    host: options.host,
    auth: typeof options.auth === 'object' ? 'custom' : options.auth,
    mcp: options.mcp,
    origin: typeof options.origin === 'function' ? 'getter' : options.origin,
    cwd: options.cwd ?? process.cwd(),
    getStorageDir: options.getStorageDir != null,
    allowedOrigins: Array.isArray(options.allowedOrigins) ? options.allowedOrigins : typeof options.allowedOrigins,
    destroyUnmatchedUpgrades: options.destroyUnmatchedUpgrades,
  })
}

function normalizeBase(base: string): string {
  return cleanDoubleSlashes(withTrailingSlash(withLeadingSlash(base)))
}

/** Compare two URL paths ignoring a trailing slash. */
function samePath(a: string, b: string): boolean {
  return withoutTrailingSlash(a) === withoutTrailingSlash(b)
}

/**
 * Render the dock client-script import map as an ES module — one dynamic
 * import thunk per dock that carries a client script (`clientScript` on
 * iframe docks, `action`, `renderer`). External viewers import this module
 * from `<base>__client-imports.js` to load per-dock client code into the
 * host page; `importFrom` values must be URL paths the host serves.
 */
function renderClientImportsModule(ctx: DevframeHubContext): string {
  const entries: string[] = []
  for (const [id, view] of ctx.docks.views) {
    const scripts: ClientScriptEntry[] = []
    const anyView = view as { clientScript?: ClientScriptEntry, action?: ClientScriptEntry, renderer?: ClientScriptEntry }
    if (anyView.clientScript)
      scripts.push(anyView.clientScript)
    if (anyView.action)
      scripts.push(anyView.action)
    if (anyView.renderer)
      scripts.push(anyView.renderer)
    if (scripts.length === 0)
      continue
    const thunks = scripts.map(script => `() => import(${JSON.stringify(script.importFrom)})`)
    entries.push(`  ${JSON.stringify(id)}: [${thunks.join(', ')}],`)
  }
  return `// Generated by @devframes/hub — dock client-script import map.\nexport const clientImports = {\n${entries.join('\n')}\n}\nexport default clientImports\n`
}

/**
 * Initiate a hub instance — the whole multi-devframe devtools surface
 * behind one framework-agnostic, web-standard handler. Every mounted
 * devframe shares one context (merged RPC registry, shared state, docks /
 * terminals / messages / commands), one WebSocket transport, and one Auth;
 * the instance serves each frame's SPA at `<base><id>/`, the discovery
 * endpoints (`__connection.json`, `__index.json`, `__client-imports.js`),
 * the aggregate MCP route, and whatever the {@link DevframeHubUi} slot
 * provides — the hub itself stays headless.
 */
export function initHub(options: InitHubOptions = {}): HubInstance {
  if (options.key) {
    const registry = hubRegistry()
    const hash = optionsHash(options)
    const existing = registry.get(options.key)
    if (existing) {
      if (existing.hash === hash)
        return existing.instance
      diagnostics.DF8001({ key: options.key })
      void existing.instance.close().catch(() => {})
    }
    const instance = instantiateHub(options)
    registry.set(options.key, { hash, instance })
    return instance
  }
  return instantiateHub(options)
}

function instantiateHub(options: InitHubOptions): HubInstance {
  const base = normalizeBase(options.base ?? DEVFRAMES_HUB_BASE)
  const baseNoSlash = withoutTrailingSlash(base)
  const app = new H3()
  const cwd = options.cwd ?? process.cwd()

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
  let ctx: DevframeHubContext
  const frames: { id: string, base: string, title: string }[] = []

  async function init(): Promise<void> {
    if (options.context && options.devframes?.length)
      throw diagnostics.DF8002()

    if (options.context) {
      ctx = options.context
    }
    else {
      const h3Host = createH3DevframeHost({
        origin: () => currentOrigin() ?? 'http://localhost',
        appName: 'devframes',
        workspaceRoot: cwd,
        mount: (mountBase, dir) => {
          mountStaticHandler(app, mountBase, dir)
        },
      })
      const host = {
        ...h3Host,
        ...(options.getStorageDir ? { getStorageDir: options.getStorageDir } : {}),
        // Serve the hub's own connection meta under every mounted frame's
        // base, so each SPA discovers the shared RPC endpoint via its
        // relative `./__connection.json` fetch — the meta's WS path is
        // hub-base-absolute, so it resolves to the one shared socket no
        // matter how deep the frame base is.
        mountConnectionMeta: (frameBase: string) => {
          app.use(joinURL(frameBase, DEVFRAME_CONNECTION_META_FILENAME), () => meta)
        },
      }
      ctx = await createHubContext({ cwd, workspaceRoot: cwd, mode: 'dev', host })
    }

    // Mount each devframe under `<base><id>/` — its SPA, its meta, and its
    // auto-registered iframe dock — after guarding the id against the
    // reserved hub filenames that live directly under the base.
    for (const def of options.devframes ?? []) {
      if ((RESERVED_HUB_PATHS as readonly string[]).includes(def.id))
        throw diagnostics.DF8000({ id: def.id })
      const frameBase = withTrailingSlash(joinURL(base, def.id))
      await mountDevframe(ctx, def, { base: frameBase })
      frames.push({ id: def.id, base: frameBase, title: def.name })
    }

    await options.configure?.(ctx)

    // Aggregate MCP — one Streamable-HTTP endpoint over the shared
    // context's whole registry (tool ids are namespaced per plugin, and the
    // wire-name collision policy is `createMcpFetchHandler`'s own).
    const mcpConfig = options.mcp === true ? {} : options.mcp
    let mcpMeta: ConnectionMeta['mcp']
    if (mcpConfig) {
      const mcpRoute = withoutLeadingSlash(mcpConfig.path ?? DEVFRAME_MCP_ROUTE)
      const { mountMcpHttp } = await import('devframe/adapters/mcp')
      const mounted = mountMcpHttp(app, ctx, joinURL(base, mcpRoute), {
        serverName: 'devframes-hub',
        serverVersion: '0.0.0',
        exposeSharedState: true,
        allowedOrigins: mcpConfig.allowedOrigins,
      })
      mcpDispose = mounted.dispose
      mcpMeta = { path: mcpRoute }
    }

    // WebSocket binding — same contract as `initDevframe`: explicit side-car
    // port > shared host server > advertise-only external URL > Bun
    // fetch-upgrade > eager auto side-car; `ws.url` always overrides the
    // advertisement (tunnel pattern). One transport for the whole hub.
    const ws = options.ws ?? {}
    const route = withoutLeadingSlash(ws.route ?? DEVFRAME_WS_ROUTE)

    const authOption = options.auth
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
      started = await startHttpAndWs({
        context: ctx,
        host: options.host ?? 'localhost',
        port: ws.port,
        path: withLeadingSlash(route),
        auth: resolvedAuth,
        allowedOrigins: options.allowedOrigins,
      })
      websocketMeta = { port: started.port, path: route }
    }
    else if (options.server) {
      started = await startHttpAndWs({
        context: ctx,
        port: 0,
        server: options.server,
        path: joinURL(base, route),
        auth: resolvedAuth,
        allowedOrigins: options.allowedOrigins,
        destroyUnmatched: options.destroyUnmatchedUpgrades,
      })
      // Hub-base-absolute so the same meta object resolves to the one
      // shared socket from the hub base *and* from every frame base.
      websocketMeta = { path: joinURL(base, route) }
    }
    else if (ws.url) {
      authHandler = undefined
      websocketMeta = ws.url
    }
    else if (typeof (globalThis as any).Bun === 'undefined') {
      const port = await getPort({ port: 9777, portRange: [9777, 9877], host: options.host ?? 'localhost' })
      started = await startHttpAndWs({
        context: ctx,
        host: options.host ?? 'localhost',
        port,
        path: withLeadingSlash(route),
        auth: resolvedAuth,
        allowedOrigins: options.allowedOrigins,
      })
      websocketMeta = { port: started.port, path: route }
    }
    else {
      const { attachBunWsTransport } = await import('devframe/rpc/transports/ws-bun')
      const { createContextRpcServer } = await import('devframe/node')
      const core = createContextRpcServer({ context: ctx, auth: resolvedAuth })
      bunTier = await attachBunWsTransport(core, { allowedOrigins: options.allowedOrigins })
      bunUpgradePath = joinURL(base, route)
      websocketMeta = { path: joinURL(base, route) }
    }
    if (ws.url)
      websocketMeta = ws.url

    meta = {
      backend: 'websocket',
      websocket: websocketMeta,
      ...(mcpMeta ? { mcp: mcpMeta } : {}),
    }

    // Hub-level discovery endpoints, registered before the viewer's static
    // mount so its SPA-fallback can't swallow them.
    app.use(joinURL(base, DEVFRAME_CONNECTION_META_FILENAME), () => meta)

    const indexDocument = (): Record<string, unknown> => ({
      base,
      frames,
      endpoints: {
        connection: DEVFRAME_CONNECTION_META_FILENAME,
        clientImports: DEVFRAME_DOCK_IMPORTS_FILENAME,
        index: '__index.json',
        websocket: meta!.websocket,
        ...(mcpMeta ? { mcp: mcpMeta.path } : {}),
        ...(options.ui?.embedded ? { embedded: 'embedded.js' } : {}),
      },
    })
    app.use(joinURL(base, '__index.json'), () => indexDocument())

    app.use(joinURL(base, DEVFRAME_DOCK_IMPORTS_FILENAME), (event) => {
      event.res.headers.set('Content-Type', 'text/javascript; charset=utf-8')
      event.res.headers.set('Cache-Control', 'no-store')
      return renderClientImportsModule(ctx)
    })

    if (options.ui?.embedded) {
      const entry = resolve(options.ui.embedded.entry)
      app.use(joinURL(base, 'embedded.js'), (event) => {
        event.res.headers.set('Content-Type', 'text/javascript; charset=utf-8')
        event.res.headers.set('Cache-Control', 'no-store')
        return Readable.toWeb(createReadStream(entry)) as ReadableStream
      })
    }

    // UI-owned assets (e.g. the reference viewer's `branding.json`), served
    // from memory. Registered before the viewer's SPA catch-all so these exact
    // routes win, mirroring the discovery endpoints above.
    for (const [key, produce] of Object.entries(options.ui?.assets ?? {})) {
      app.use(joinURL(base, key), (event) => {
        event.res.headers.set('Content-Type', assetContentType(key))
        event.res.headers.set('Cache-Control', 'no-store')
        return produce()
      })
    }

    if (options.ui?.viewer) {
      // The viewer SPA owns the hub base (mounted last — exact routes above
      // win; frame mounts are longer prefixes and route ahead of it).
      mountStaticHandler(app, base, resolve(options.ui.viewer.distDir))
    }
    else {
      // Headless root: the index document, so the base is never a dead end.
      app.use(baseNoSlash, () => indexDocument())
      app.use(base, () => indexDocument())
    }

    maybePrintBanner()
  }

  const initPromise = init()
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
      return await bunTier.handleUpgrade(request, server) as Response
    }
    const response = await app.fetch(request)
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

  const instance: HubInstance = {
    handler: handleRequest,
    nodeMiddleware,
    websocket: {
      open: ws => void bunTier?.websocket.open?.(ws),
      message: (ws, message) => void bunTier?.websocket.message(ws, message),
      close: (ws, code, reason) => void bunTier?.websocket.close?.(ws, code, reason),
      drain: ws => void bunTier?.websocket.drain?.(ws),
    },
    ready: initPromise,
    context: contextPromise,
    connectionMeta: () => {
      if (!meta)
        throw diagnostics.DF8003()
      return meta
    },
    close: async () => {
      if (options.key) {
        const registry = hubRegistry()
        if (registry.get(options.key)?.instance === instance)
          registry.delete(options.key)
      }
      await initPromise.catch(() => {})
      await mcpDispose?.()
      await started?.close()
      await bunTier?.close()
    },
  }
  return instance
}
