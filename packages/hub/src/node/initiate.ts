import type { DevframeInstanceRecord, InstanceShellApi } from 'devframe/internal'
import type { DevframeAuthHandler } from 'devframe/node/auth'
import type { WsOriginRegistry } from 'devframe/rpc/transports/ws-server'
import type { ConnectionMeta, DevframeDefinition, DevframeServiceInput, DevframeSseOptions, DevframeStorageScope, DevframeWsOptions, McpRouteOptions } from 'devframe/types'
import type { Buffer } from 'node:buffer'
import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ClientScriptEntry } from '../types/docks'
import type { CreateHubContextOptions, DevframeHubContext } from './context'
import type { InstallDevframeOptions } from './install-devframe'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { DEVFRAME_CONNECTION_META_FILENAME, DEVFRAME_DOCK_IMPORTS_FILENAME, DEVFRAME_MCP_ROUTE, DEVFRAME_WS_ROUTE } from 'devframe/constants'
import { createH3DevframeHost, createInstanceShell, importRuntimeModule, resolveInstanceRegister } from 'devframe/internal'
import { mountStaticHandler } from 'devframe/utils/serve-static'
import { H3 } from 'h3'
import { resolve } from 'pathe'
import { joinURL, withoutLeadingSlash, withTrailingSlash } from 'ufo'
import { resolveClientModuleSpecifier } from '../client-modules'
import { DEVFRAMES_HUB_BASE, DOCK_RENDERERS_STATE_KEY, normalizeHubBase } from '../constants'
import { createHubContext } from './context'
import { diagnostics } from './diagnostics'
import { prepareDevframe } from './install-devframe'

/** A `devframes` entry with per-mount dock customization. */
export interface HubDevframeEntry {
  devframe: DevframeDefinition
  /** Per-mount overrides for the auto-synthesized iframe dock entry. */
  dock?: InstallDevframeOptions['dock']
}

type Thenable<T> = T | Promise<T>
type Arrayable<T> = T | readonly T[]

function normalizeDevframeEntry(entry: DevframeDefinition | HubDevframeEntry): HubDevframeEntry {
  return 'devframe' in entry ? entry : { devframe: entry }
}

/** Default mount base for a hub instance - re-exported from `../constants` (the client-safe home) for existing importers of this node entry. */
export { DEVFRAMES_HUB_BASE }

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

/** Reserved filenames directly under the hub base - a frame id can't shadow them. */
const RESERVED_HUB_PATHS = [
  DEVFRAME_CONNECTION_META_FILENAME,
  DEVFRAME_DOCK_IMPORTS_FILENAME,
  DEVFRAME_WS_ROUTE,
  DEVFRAME_MCP_ROUTE,
  '__index.json',
  '__renderers',
  'embedded.js',
] as const

/**
 * One dock-type → prebuilt renderer-module registration for
 * {@link InitHubOptions.renderers}. The hub serves the module at
 * `<base>__renderers/<type>.mjs` and publishes it in the renderer manifest
 * (the `devframe:dock-renderers` shared-state slot), so any viewer - the
 * reference UI, a community viewer, a hand-rolled host page - lazily imports
 * it the first time a dock of that `type` needs rendering.
 *
 * The module must be a **self-contained browser ES module** (its framework
 * and styles bundled in) whose {@link DockRendererRegistration.importName}
 * export is a ready `DockRenderer`. Renderer packages ship a node helper
 * returning this shape - e.g. `jsonRenderUiRenderer()` from
 * `@devframes/json-render-ui/hub`.
 */
export interface DockRendererRegistration {
  /** Dock `type` this renderer handles (e.g. `'json-render'`). */
  type: string
  /** Absolute path of the prebuilt, self-contained browser ES module. */
  file: string
  /**
   * Named export carrying the renderer.
   *
   * @default 'default'
   */
  importName?: string
}

/**
 * The UI slot of a hub instance - pure data, zero policy. The hub itself is
 * headless: whoever fills this slot decides what a viewer looks like.
 * `@devframes/hub-ui` ships the reference implementation (`createUi()`);
 * Vite DevTools or any community viewer supplies its own object to the same
 * slot and reuses all the infrastructure.
 */
export interface DevframeHubUi {
  /**
   * A standalone viewer SPA (built with relative asset paths) served at the
   * hub base itself - open `<base>` in a tab and the devtools are there.
   */
  viewer?: {
    /** Directory of the prebuilt viewer SPA. */
    distDir: string
  }
  /**
   * A prebuilt, self-contained script served at `<base>embedded.js` - the
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
   * from memory. Keys are base-relative paths; the content-type is inferred
   * from the key's extension. A generic seam a viewer uses to publish
   * arbitrary runtime documents without teaching the hub anything about
   * their meaning.
   */
  assets?: Record<string, () => string | Uint8Array>
  /**
   * A setup hook run once during hub init with the hub context - the UI
   * slot's chance to publish its own static, boot-time config through the
   * generic `ctx.staticConfig` (serialized into `ConnectionMeta.configs`).
   * The reference UI's `createUi()` uses it to set
   * `ctx.staticConfig.ui = { branding, … }`, reaching every mounted frame and
   * the standalone viewer through the one connection handshake they perform.
   * The hub stays policy-free about what the UI writes.
   */
  setup?: (ctx: DevframeHubContext) => void | Promise<void>
}

export type DevframesInput = Array<
  | DevframeDefinition
  | HubDevframeEntry
  | Thenable<Arrayable<DevframeDefinition | HubDevframeEntry | null | undefined>>
  | (() => Thenable<Arrayable<DevframeDefinition | HubDevframeEntry | null | undefined>>)
>

export interface InitHubOptions {
  /**
   * Name for the hub instance, used in logs and diagnostics, and mcp server.
   */
  name?: string
  /**
   * Version for the hub instance, used in logs and diagnostics, and mcp server.
   */
  version?: string
  /**
   * Mount base the hub answers under - required so the mount path is
   * explicit at the call site (pass the exported {@link DEVFRAMES_HUB_BASE}
   * for the conventional `/__devframes/`). Every mounted devframe lives at
   * `<base><id>/`, so the host app needs exactly one catch-all route. The
   * resolved value is echoed back as {@link HubInstance.base} so route and
   * middleware code references it instead of repeating the string.
   */
  base: string
  /**
   * Devframes to mount: each runs its `setup()` against the shared hub
   * context (one merged RPC registry, one WebSocket, one auth gate), serves
   * its SPA at `<base><id>/`, and is auto-registered as an iframe dock.
   * Wrap an entry in `{ devframe, dock }` to customize its synthesized dock
   * (category, icon, a `clientScript` to run in the host page, …).
   */
  devframes?: DevframesInput
  /**
   * Host-level wire services to install, on top of whatever the mounted
   * devframes declare. Constructed (option sets merged) at the pre-setup
   * barrier, so every devframe's `setup` sees them ready. Reach for this to
   * configure a shared service centrally - e.g.
   * `services: [createShikiService({ themes })]`.
   */
  services?: DevframeServiceInput[]
  /**
   * Extra RPC declarations registered at context creation, alongside the
   * hub built-ins - forwarded to `createHubContext`'s
   * `builtinRpcDeclarations`. Declarative mode only (a pre-built `context`
   * already made this choice).
   */
  rpcDeclarations?: CreateHubContextOptions['builtinRpcDeclarations']
  /**
   * Bring your own hub context instead of `devframes` - for hosts that
   * assemble `createHubContext` + `ctx.install` themselves (with their own
   * `DevframeHost` serving the frames). The instance then serves only the
   * hub-level endpoints (`__connection.json`, `__index.json`,
   * `__client-imports.js`, the WS transport, MCP, and the `ui` slot);
   * serve each frame's meta yourself from {@link HubInstance.connectionMeta}.
   */
  context?: DevframeHubContext
  /**
   * Runs once the context exists and every `devframes` entry is mounted -
   * register docks, commands, terminals, and messages surfaces here.
   */
  configure?: (ctx: DevframeHubContext) => void | Promise<void>
  /** See {@link DevframeHubUi} - omitted, the hub stays fully headless. */
  ui?: DevframeHubUi
  /**
   * Prebuilt dock-renderer modules to serve and advertise - the composition
   * seam that hands a renderer package (e.g. `@devframes/json-render-ui`) to
   * a prebuilt viewer. Each {@link DockRendererRegistration} is served at
   * `<base>__renderers/<type>.mjs` and published in the renderer manifest;
   * clients import a module lazily the first time a dock of its `type`
   * mounts. Renderers registered directly in client code
   * (`createDevframeClientRuntime({ renderers })`) take precedence.
   *
   * ```ts
   * import { jsonRenderUiRenderer } from '@devframes/json-render-ui/hub'
   *
   * initHub({ ui: createUi(), renderers: [jsonRenderUiRenderer()] })
   * ```
   */
  renderers?: readonly DockRendererRegistration[]
  /**
   * Share the host's `node:http` server for the WebSocket RPC endpoint
   * (upgrade bound at `<base>__ws`). Hosts whose handlers never see upgrades
   * (Next.js route handlers, Nitro, Rsbuild) ask for a side-car instead with
   * `ws: { sidecar: true }`; hosts that get their server later wire
   * {@link HubInstance.attach} / {@link HubInstance.handleUpgrade}.
   */
  server?: NodeHttpServer
  /**
   * Explicit WebSocket control, same contract as `initDevframe`: the local
   * binding resolves `ws.port` (pinned side-car) > `server` (shared upgrade)
   * > `ws.sidecar` (auto-port side-car) > the host driving upgrades itself,
   * while `url` overrides the advertisement (tunnel pattern) and `route`
   * renames the upgrade segment (default `__ws`). Pass `false` to serve no
   * WebSocket at all - clients connect over SSE instead (`backend: 'sse'`).
   */
  ws?: DevframeWsOptions | false
  /**
   * SSE RPC endpoint control, same contract as `initDevframe` - enabled by
   * default at `<base>__sse` as the more portable transport alongside the
   * WebSocket. Pass `false` to disable, or a {@link DevframeSseOptions} to
   * rename the route.
   */
  sse?: boolean | DevframeSseOptions
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
   * Expose the **aggregate** MCP endpoint at `<base>__mcp` - one
   * Streamable-HTTP server over the shared context's whole tool registry
   * (ids are already namespaced per plugin). Disabled by default.
   */
  mcp?: boolean | McpRouteOptions
  /**
   * Public origin the host app is reachable at, or a getter. Derived lazily
   * from the first request when omitted.
   */
  origin?: string | (() => string)
  /**
   * Publish this hub in the global instance registry
   * (`~/.devframe/instances/`) so discovery tooling (`devframe connect`, the
   * inspect plugin's Instances tab) lists it like any standalone devframe.
   * Registration is a dynamic import that fires once the public origin
   * resolves and is torn down on {@link HubInstance.close}. Defaults to off;
   * pass `true` to enable, or an object to override individual record fields
   * (`id`, `name`, `basePath`, …).
   */
  register?: boolean | Partial<DevframeInstanceRecord>
  /**
   * Advertise that this host runtime resolves **bare-specifier** client
   * scripts (`ClientScriptEntry.importFrom` naming an npm module) - a URL
   * template whose `{specifier}` token is replaced with the specifier,
   * published as `ConnectionMeta.configs.dock.clientModuleResolution` and
   * applied by every client-script loader. Declare it only when the host can
   * actually serve npm modules to the browser - a Vite host passes
   * `'/@id/{specifier}'` to route imports through its own module graph
   * (`@devframes/vite/hub` does). Left undeclared, registering a
   * bare-specifier client script warns `DF8111` - ship a self-contained
   * bundle and pass its URL instead.
   */
  clientModuleResolution?: string
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
   * The normalized mount base this hub answers under (leading and trailing
   * slash, e.g. `/__devframes/`). Reference it when wiring the mount - route
   * guards, middleware path checks - instead of repeating the string literal.
   */
  base: string
  /**
   * Web-standard request handler for the whole hub - mount it on one
   * catch-all route under {@link HubInstance.base}.
   */
  handler: (request: Request) => Promise<Response>
  /** Connect/Express-style middleware over the same surface; `next()`s outside the base. */
  nodeMiddleware: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void
  /**
   * Route a host server's `upgrade` events to the shared RPC socket,
   * returning a detach function - the manual counterpart to the `server`
   * option, for hosts that get their `node:http` server only after the hub
   * exists. Available on the default tier; a configured transport (`server`,
   * `ws.port`, `ws.sidecar`, `ws.url`) already owns the socket and reports
   * `DF0055` / `DF0056` instead.
   */
  attach: (server: NodeHttpServer) => () => void
  /**
   * Complete a single `upgrade` event on the shared RPC socket, for hosts
   * that already own an `upgrade` listener. Same availability as
   * {@link HubInstance.attach}.
   */
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void
  /** Resolves once every frame is mounted and the WebSocket binding is live. */
  ready: Promise<void>
  /** The shared hub context, once initialized. */
  context: Promise<DevframeHubContext>
  /** The `ConnectionMeta` served at `<base>__connection.json` (and every frame base). */
  connectionMeta: () => ConnectionMeta
  /** Tear down: WS transport/side-car, MCP handler. */
  close: () => Promise<void>
}

/** One resolved `devframes` slot: an entry, or nothing when it opted out. */
type ResolvedDevframeEntry = DevframeDefinition | HubDevframeEntry | null | undefined

/**
 * Flatten the `devframes` input: await every thenable, call every factory,
 * spread the arrays, and drop the empty slots - so a host can build the list
 * conditionally (`isDev && loadInspect()`) without filtering it first.
 */
function resolveDevframesInput(input: DevframesInput): Promise<HubDevframeEntry[]> {
  return Promise.all(input.map(async (entry) => {
    const resolved = await (typeof entry === 'function' ? entry() : entry)
    const slots: readonly ResolvedDevframeEntry[] = Array.isArray(resolved)
      ? resolved
      : [resolved as ResolvedDevframeEntry]
    return slots
      .filter((slot): slot is DevframeDefinition | HubDevframeEntry => slot != null)
      .map(normalizeDevframeEntry)
  }))
    .then(arrays => arrays.flat())
}

/**
 * Validate the renderer-module registrations fail-fast: route-safe types
 * (each becomes the `<base>__renderers/<type>.mjs` URL segment), one module
 * per type, and an existing bundle file (renderer packages are prebuilt).
 */
function resolveRendererRegistrations(
  registrations: readonly DockRendererRegistration[],
): DockRendererRegistration[] {
  const seen = new Set<string>()
  return registrations.map((registration) => {
    if (!/^[\w.-]+$/.test(registration.type))
      throw diagnostics.DF8110({ type: registration.type })
    if (seen.has(registration.type))
      throw diagnostics.DF8108({ type: registration.type })
    seen.add(registration.type)
    const file = resolve(registration.file)
    if (!existsSync(file))
      throw diagnostics.DF8109({ type: registration.type, file })
    return { ...registration, file }
  })
}

/**
 * Render the dock client-script import map as an ES module - one dynamic
 * import thunk per dock that carries a client script (`clientScript` on
 * iframe docks, `action`, `renderer`). External viewers import this module
 * from `<base>__client-imports.js` to load per-dock client code into the
 * host page; `importFrom` values are URL paths the host serves, or bare npm
 * specifiers resolved through the host's `clientModuleResolution` template.
 */
function renderClientImportsModule(ctx: DevframeHubContext): string {
  const template = ctx.staticConfig.dock?.clientModuleResolution
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
    const thunks = scripts.map(script =>
      `() => import(${JSON.stringify(resolveClientModuleSpecifier(script.importFrom, { template }))})`)
    entries.push(`  ${JSON.stringify(id)}: [${thunks.join(', ')}],`)
  }
  return `// Generated by @devframes/hub - dock client-script import map.\nexport const clientImports = {\n${entries.join('\n')}\n}\nexport default clientImports\n`
}

/**
 * Resolve the shared hub context: reuse a caller-supplied one, or build an
 * h3-backed context that serves the hub's connection meta under every frame.
 */
async function resolveHubContext(
  options: InitHubOptions,
  app: H3,
  cwd: string,
  api: InstanceShellApi,
): Promise<DevframeHubContext> {
  if (options.context && options.devframes?.length)
    throw diagnostics.DF8002()
  if (options.context)
    return options.context

  const h3Host = createH3DevframeHost({
    origin: () => api.origin() ?? 'http://localhost',
    appName: 'devframes',
    workspaceRoot: cwd,
    mount: (mountBase, dir) => {
      mountStaticHandler(app, mountBase, dir)
    },
  })
  const host = {
    ...h3Host,
    ...(options.getStorageDir ? { getStorageDir: options.getStorageDir } : {}),
    /**
     * Serve the hub's own connection meta under every mounted frame's
     * base, so each SPA discovers the shared RPC endpoint via its
     * relative `./__connection.json` fetch - the meta's WS path is
     * hub-base-absolute, so it resolves to the one shared socket no
     * matter how deep the frame base is.
     */
    mountConnectionMeta: (frameBase: string) => {
      app.use(joinURL(frameBase, DEVFRAME_CONNECTION_META_FILENAME), () => api.connectionMeta())
    },
  }
  return createHubContext({
    cwd,
    workspaceRoot: cwd,
    mode: 'dev',
    host,
    ...(options.rpcDeclarations ? { builtinRpcDeclarations: options.rpcDeclarations } : {}),
  })
}

/**
 * Pass 1 - mount each devframe under `<base><id>/` (SPA, meta, iframe dock)
 * and queue its declared services, guarding the id against reserved hub
 * filenames and route-pattern characters. Returns the deferred setup thunks.
 */
async function mountDevframes(
  ctx: DevframeHubContext,
  devframes: HubDevframeEntry[],
  base: string,
  frames: { id: string, base: string, title: string }[],
): Promise<(() => Promise<void>)[]> {
  const setups: (() => Promise<void>)[] = []
  for (const { devframe: def, dock } of devframes) {
    if ((RESERVED_HUB_PATHS as readonly string[]).includes(def.id))
      throw diagnostics.DF8000({ id: def.id })
    // The id becomes a URL segment (`<base><id>/`) routed by h3 - `:` and
    // `*` are route-pattern markers there, and separators would escape the
    // segment entirely.
    if (!/^[\w.-]+$/.test(def.id))
      throw diagnostics.DF8004({ id: def.id })
    const frameBase = withTrailingSlash(joinURL(base, def.id))
    const run = await prepareDevframe(ctx, def, { base: frameBase, ...(dock ? { dock } : {}) })
    if (run)
      setups.push(run)
    frames.push({ id: def.id, base: frameBase, title: def.name })
  }
  return setups
}

/**
 * Initiate a hub instance - the whole multi-devframe devtools surface
 * behind one framework-agnostic, web-standard handler. Every mounted
 * devframe shares one context (merged RPC registry, shared state, docks /
 * terminals / messages / commands), one WebSocket transport, and one Auth;
 * the instance serves each frame's SPA at `<base><id>/`, the discovery
 * endpoints (`__connection.json`, `__index.json`, `__client-imports.js`),
 * the aggregate MCP route, and whatever the {@link DevframeHubUi} slot
 * provides - the hub itself stays headless.
 *
 * The factory is synchronous and initializes eagerly, and binds no port of
 * its own: the WebSocket follows `server` / `ws` (see
 * {@link InitHubOptions.ws}), or waits for the host to hand upgrades over
 * through {@link HubInstance.attach}.
 */
export function initHub(options: InitHubOptions): HubInstance {
  const base = normalizeHubBase(options.base)
  const baseNoSlash = base.slice(0, -1)
  const app = new H3()
  const cwd = options.cwd ?? process.cwd()
  const frames: { id: string, base: string, title: string }[] = []
  const rendererRegistrations = resolveRendererRegistrations(options.renderers ?? [])

  const shell = createInstanceShell<DevframeHubContext>({
    base,
    app,
    host: options.host,
    origin: options.origin,
    auth: options.auth,
    server: options.server,
    ws: options.ws,
    sse: options.sse,
    allowedOrigins: options.allowedOrigins,
    destroyUnmatchedUpgrades: options.destroyUnmatchedUpgrades,
    register: resolveInstanceRegister(options.register, {
      id: options.name ?? 'devframes-hub',
      ...(options.name !== undefined ? { name: options.name } : {}),
      rootDir: cwd,
    }),
    /**
     * One meta document is served from the hub base *and* from every frame
     * base, so the advertised WS path has to be base-absolute to resolve to
     * the same socket from any depth.
     */
    absoluteWsPath: true,
    resolveSidecarPort: async (sidecarHost) => {
      const { getPort } = await import('get-port-please')
      return getPort({ port: 9777, portRange: [9777, 9877], host: sidecarHost })
    },
    onMetaUnavailable: () => {
      throw diagnostics.DF8003()
    },

    async init(api) {
      const ctx = await resolveHubContext(options, app, cwd, api)

      // Publish the host's bare-specifier resolution template before anything
      // registers a dock, so the docks host's bare-specifier capability check
      // (`DF8111`) already sees it - the shell serializes `ctx.staticConfig`
      // into `ConnectionMeta.configs` after this `init` returns.
      if (options.clientModuleResolution) {
        ctx.staticConfig.dock = {
          ...ctx.staticConfig.dock,
          clientModuleResolution: options.clientModuleResolution,
        }
      }

      const devframes = await resolveDevframesInput(options.devframes ?? [])
      // Host-level services declared on `initHub` join the pre-setup
      // collection alongside every devframe's own declared services.
      for (const input of options.services ?? [])
        void ctx.services.install(input)
      const setups = await mountDevframes(ctx, devframes, base, frames)

      // Construct every collected service once, then run the setups - so a
      // devframe's setup consumes services (its own or another devframe's)
      // synchronously via `ctx.services.get`.
      await ctx.services.ready()
      for (const run of setups)
        await run()

      await options.configure?.(ctx)

      // The UI slot publishes its own static config (branding, dock
      // preferences, …) into `ctx.staticConfig` - run last so it can see the
      // installed devframes. The instance shell serializes `ctx.staticConfig`
      // into the connection meta right after this `init` returns.
      await options.ui?.setup?.(ctx)

      // Publish the authoritative renderer manifest, including an empty one.
      // Each `importFrom` is base-absolute so it resolves to the served module
      // from any page depth. Clients import a module lazily the first time a
      // dock of that type mounts.
      const manifest: Record<string, ClientScriptEntry> = {}
      for (const registration of rendererRegistrations) {
        manifest[registration.type] = {
          importFrom: joinURL(base, '__renderers', `${registration.type}.mjs`),
          ...(registration.importName ? { importName: registration.importName } : {}),
        }
      }
      const manifestState = await ctx.rpc.sharedState.get<Record<string, ClientScriptEntry>>(
        DOCK_RENDERERS_STATE_KEY,
        { initialValue: {} },
      )
      manifestState.mutate(() => manifest)

      // Aggregate MCP - one Streamable-HTTP endpoint over the shared
      // context's whole registry (tool ids are namespaced per plugin, and the
      // wire-name collision policy is `createMcpFetchHandler`'s own).
      const mcpConfig = options.mcp === true ? {} : options.mcp
      if (!mcpConfig)
        return { context: ctx }

      const mcpRoute = withoutLeadingSlash(mcpConfig.path ?? DEVFRAME_MCP_ROUTE)
      const { mountMcpHttp } = await importRuntimeModule<typeof import('devframe/adapters/mcp')>('devframe/adapters/mcp')
      const mounted = mountMcpHttp(app, ctx, joinURL(base, mcpRoute), {
        serverName: options.name ?? 'devframes-hub',
        serverVersion: options.version ?? '0.0.0',
        exposeSharedState: true,
        allowedOrigins: mcpConfig.allowedOrigins,
      })
      return { context: ctx, mcp: { path: mcpRoute }, dispose: mounted.dispose }
    },

    mount(ctx, meta) {
      // `meta.configs` already carries whatever `ctx.staticConfig` collected
      // during init - the UI slot's `setup(ctx)` (branding, dock preferences,
      // …) and any devframe's own contributions. Nothing to add here.

      // Hub-level discovery endpoints, registered before the viewer's static
      // mount so its SPA-fallback can't swallow them.
      app.use(joinURL(base, DEVFRAME_CONNECTION_META_FILENAME), () => meta)

      const indexDocument = (): Record<string, unknown> => ({
        name: options.name,
        version: options.version,
        base,
        frames,
        endpoints: {
          connection: DEVFRAME_CONNECTION_META_FILENAME,
          clientImports: DEVFRAME_DOCK_IMPORTS_FILENAME,
          index: '__index.json',
          websocket: meta.websocket,
          ...(meta.mcp ? { mcp: meta.mcp.path } : {}),
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
        // Buffered rather than streamed: the bootstrap is a single ~1 MB file
        // read per request in dev, and a buffered body survives every host's
        // request bridging (dev-server worker proxies included).
        app.use(joinURL(base, 'embedded.js'), async (event) => {
          event.res.headers.set('Content-Type', 'text/javascript; charset=utf-8')
          event.res.headers.set('Cache-Control', 'no-store')
          return await readFile(entry)
        })
      }

      // Renderer modules - each registration's prebuilt bundle, buffered like
      // `embedded.js` (a single self-contained file read per request in dev;
      // a buffered body survives every host's request bridging).
      for (const registration of rendererRegistrations) {
        app.use(joinURL(base, '__renderers', `${registration.type}.mjs`), async (event) => {
          event.res.headers.set('Content-Type', 'text/javascript; charset=utf-8')
          event.res.headers.set('Cache-Control', 'no-store')
          return await readFile(registration.file)
        })
      }

      // UI-owned assets, served from memory. Registered before the viewer's
      // SPA catch-all so these exact routes win, mirroring the discovery
      // endpoints above.
      for (const [key, produce] of Object.entries(options.ui?.assets ?? {})) {
        app.use(joinURL(base, key), (event) => {
          event.res.headers.set('Content-Type', assetContentType(key))
          event.res.headers.set('Cache-Control', 'no-store')
          return produce()
        })
      }

      if (options.ui?.viewer) {
        // The viewer SPA owns the hub base (mounted last - exact routes above
        // win; frame mounts are longer prefixes and route ahead of it).
        mountStaticHandler(app, base, resolve(options.ui.viewer.distDir))
      }
      else {
        // Headless root: the index document, so the base is never a dead end.
        app.use(baseNoSlash, () => indexDocument())
        app.use(base, () => indexDocument())
      }
    },
  })

  return {
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
}
