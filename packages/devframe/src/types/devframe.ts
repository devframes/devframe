import type { CAC } from 'cac'
import type { CliFlagsSchema } from '../adapters/flags'
import type { DevframeAuthHandler } from '../node/auth/handler'
import type { DevframeNodeContext } from './context'
import type { StaticAssetsSource } from './remote-assets'
import type { DevframeServiceInput } from './services'

/**
 * Classification of how a devframe is being deployed. Hosted adapters
 * (`vite`, `embedded`) share their origin with a host app and must
 * namespace their mount path under `/__<id>/`. Standalone adapters
 * (`cli`, `build`) own the origin and default to `/`.
 */
export type DevframeDeploymentKind = 'standalone' | 'hosted'

/**
 * How a hub deduplicates devframes that share an `id` when more than one
 * is mounted onto the same hub. See {@link DevframeDefinition.duplicationStrategy}.
 *
 * - `'warn'` (default): keep the first registration, drop later
 *   duplicates, and emit a warning diagnostic (`DF8105`).
 * - `'silent'`: drop later duplicates without warning.
 * - `'throw'`: throw when a duplicate is mounted.
 * - `'duplicate'`: let every instance coexist under a disambiguated
 *   dock id.
 */
export type DevframeDuplicationStrategy = 'warn' | 'silent' | 'throw' | 'duplicate'

/**
 * Controls where the browser opens the RPC WebSocket, advertised in
 * `__connection.json` and used to bind the dev server. The three shapes map
 * to the three connection scenarios; precedence is `url` > `port` > `route`:
 *
 *   1. **Same server, different route** (default): leave `port`/`url` unset.
 *      The socket shares the HTTP server's port and binds to `route`
 *      (`__ws`). The client connects to its own origin, so the link
 *      survives a reverse proxy that rewrites the host/port/subpath.
 *
 *   2. **Different port**: set `port`. The socket binds on its own port on the
 *      same host; the client targets `ws(s)://<page-host>:<port>/<route>`.
 *
 *   3. **Remote, different origin**: set `url` to a full `ws://`/`wss://`
 *      endpoint (e.g. a public tunnel or relay). The client uses it verbatim.
 */
export interface DevframeWsOptions {
  /**
   * Upgrade route segment the socket binds to and is advertised at, relative
   * to the SPA base. Default: `__ws`.
   */
  route?: string
  /**
   * Bind the socket on its own port instead of sharing the HTTP port. The
   * browser connects to this port on the page's hostname. Implies
   * {@link DevframeWsOptions.sidecar}.
   */
  port?: number
  /**
   * Start a side-car WebSocket server on a free port, for hosts whose request
   * handlers can't accept upgrades (Next.js route handlers, Nitro, Rsbuild).
   * The resolved port is advertised in `__connection.json`, so the browser
   * finds it without any further wiring. Set `port` instead to pin it.
   */
  sidecar?: boolean
  /**
   * Advertise a fixed, fully-qualified endpoint on another origin (a full
   * `ws://`/`wss://` URL). Takes precedence over `port`/`route` in the meta.
   */
  url?: string
}

/**
 * Controls the SSE RPC endpoint, the WebSocket-free transport for hosts
 * and proxies where the upgrade isn't available. It rides whatever HTTP
 * surface serves the instance (the same one serving `__connection.json`),
 * so a relative `route` always resolves; there is no port plumbing of its
 * own. Enabled by default alongside the WebSocket; pass `sse: false` to
 * disable, or `ws: false` to run SSE-only (`backend: 'sse'`).
 */
export interface DevframeSseOptions {
  /**
   * Route segment the SSE endpoint binds to and is advertised at, relative
   * to the SPA base. Default: `__sse`.
   */
  route?: string
}

/**
 * Configuration for the route-based MCP server mounted alongside the dev
 * server (opt-in via {@link DevframeCliOptions.mcp}). The endpoint speaks
 * the MCP Streamable-HTTP transport over the same origin as the SPA,
 * exposing the definition's `ctx.agent` tools + shared-state resources to
 * external MCP clients connected to the *running* server.
 */
export interface McpRouteOptions {
  /**
   * Route segment the MCP endpoint binds to, relative to the SPA base.
   * Default: `__mcp` (i.e. `/__mcp` standalone, `/__<id>/__mcp` hosted).
   */
  path?: string
  /**
   * Extra `Origin` header values to accept beyond the loopback default
   * (`localhost`/`127.0.0.1`/`::1` and any `Origin`-less native client).
   * Add your LAN/tunnel origin here when reaching the endpoint from another
   * host, mirroring the WS transport's origin gate. Pass `false` to disable
   * origin checking entirely (not recommended). Default: loopback-only.
   *
   * This is the endpoint's DNS-rebinding protection: the shared
   * `isAllowedOrigin` gate the WS upgrade already uses, applied as external
   * middleware (the approach the MCP SDK now recommends over its own
   * deprecated `allowedHosts`/`allowedOrigins` transport flags).
   */
  allowedOrigins?: readonly string[] | false
}

export interface DevframeCliOptions {
  /** Binary name; default: the devframe's `id`. */
  command?: string
  /** Preferred port for the dev server (default 9999). */
  port?: number
  /** Port scan range, forwarded to `get-port-please`. */
  portRange?: [number, number]
  /** Prefer a random open port. */
  random?: boolean
  /** Default host to bind to; `--host` overrides. */
  host?: string
  /**
   * Auto-open the browser when the dev server starts.
   * `true` opens the resolved origin; a string opens that relative path.
   * The `--open` / `--no-open` flags override this.
   */
  open?: boolean | string
  /**
   * Authentication for the standalone dev server.
   *
   *   - `undefined` / `true`: the standalone adapters (`cli` /
   *     served `build`) auto-wire devframe's interactive OTP auth
   *     (`createInteractiveAuth`): an untrusted client can only reach
   *     `anonymous:` methods until it exchanges the printed one-time code.
   *     The adapter prints the code + magic-link banner once the server is
   *     listening.
   *   - `false`: no gate, for trusted single-user localhost tools where an
   *     auth round-trip only gets in the way (the built-in plugins set this).
   *     The `--no-auth` CLI flag maps here for one-off runs.
   *   - A {@link DevframeAuthHandler}: a custom handler (e.g. a tuned
   *     `createInteractiveAuth`, or an entirely different scheme) passed
   *     straight through to the RPC transport binding.
   *
   * Hosted adapters (`vite`, `embedded`) ignore this and defer to the host's
   * auth; `@vitejs/devtools` honors the equivalent `devtools.clientAuth`.
   *
   * @default true
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Expose a route-based MCP server alongside the dev server, speaking the
   * MCP Streamable-HTTP transport at `/__mcp` (relative to the base path).
   * It surfaces the same `ctx.agent` tools + shared-state resources as the
   * stdio `mcp` command, but against the live, running server.
   *
   * - `false` / omitted (default): no MCP route is mounted.
   * - `true`: mount at the default `__mcp` route with the loopback-only
   *   origin gate.
   * - {@link McpRouteOptions}: customise the route path / allowed origins.
   *
   * The `--mcp` / `--no-mcp` CLI flags override this per run.
   */
  mcp?: boolean | McpRouteOptions
  /**
   * Author's SPA dist, served as the devframe's UI.
   *
   * @deprecated Moved to the top-level {@link DevframeDefinition.clientAssets}.
   * Set `clientAssets` on the definition instead. This field is still read as a
   * fallback when `clientAssets` is unset, so existing definitions keep working.
   */
  distDir?: StaticAssetsSource
  /**
   * How the browser reaches the RPC WebSocket. Defaults to sharing the HTTP
   * port on the `__ws` route. See {@link DevframeWsOptions} for the
   * different-port and remote-origin variants. Pass `false` to serve no
   * WebSocket at all; clients connect over SSE instead (`backend: 'sse'`).
   */
  ws?: DevframeWsOptions | false
  /**
   * How the browser reaches the SSE RPC endpoint, enabled by default
   * alongside the WebSocket as the more portable transport. Pass `false`
   * to disable, or a {@link DevframeSseOptions} to change its route.
   */
  sse?: boolean | DevframeSseOptions
  /**
   * Capability-side CAC hook. Called with the CAC instance after the
   * adapter registers its built-in commands (`build` / `mcp`)
   * but before `createCac`'s own `configureCli` caller. Use this to
   * contribute tool-specific flags and subcommands from the definition
   * itself.
   */
  configure?: (cli: CAC) => void
  /**
   * Typed CLI flags for the default `dev` command, backed by any
   * [Standard Schema](https://standardschema.dev/) validator (valibot,
   * zod, arktype, or devframe's built-in `s`). The adapter registers
   * matching `--kebab-key` options on CAC, validates the parsed values,
   * and forwards the typed bag to `setup(ctx, { flags })`.
   *
   * Use {@link defineCliFlags} to preserve the literal schema-map
   * shape, and {@link InferCliFlags} to recover the typed output at the
   * call site:
   *
   * ```ts
   * const appFlags = defineCliFlags({
   *   depth: v.pipe(v.number(), v.integer()),
   *   config: v.optional(v.string()),
   * })
   *
   * defineDevframe({
   *   cli: { flags: appFlags },
   *   setup(ctx, info) {
   *     const flags = info.flags as InferCliFlags<typeof appFlags>
   *   },
   * })
   * ```
   */
  flags?: CliFlagsSchema
}

/**
 * Default dock attributes for the iframe entry a hub synthesizes when it
 * mounts this devframe. Framework-neutral metadata only; the hub layer
 * (`ctx.install`) merges these beneath its per-mount `dock` overrides,
 * which in turn sit beneath the locked, derived `id` / `type` / `url`.
 *
 * Every field is optional. `title` / `icon` default to the definition's
 * `name` / `icon` when omitted here; the rest are unset by default.
 * Standalone adapters (`cli` / `build`) ignore this entirely.
 */
export interface DevframeDockDefaults {
  /** Dock entry title. Defaults to the definition's `name`. */
  title?: string
  /** Dock entry icon. Defaults to the definition's `icon`. */
  icon?: string | { light: string, dark: string }
  /**
   * Sort weight within the dock; higher sorts earlier.
   * @default 0
   */
  defaultOrder?: number
  /**
   * Category the entry groups under in the dock.
   * @default 'default'
   */
  category?: string
  /**
   * Conditional-visibility expression (same syntax as command `when`
   * clauses). Set to `'false'` to hide the entry unconditionally.
   */
  when?: string
  /**
   * Render-only visibility expression, same syntax as {@link when}. Hides the
   * entry's own dock-bar button when it evaluates to `false` while leaving it
   * registered and reachable (activation, RPC lookups, etc.), unlike `when`,
   * which is the general relevance switch for the entry as a whole.
   */
  visibility?: string
  /** Badge text rendered on the dock icon (e.g. an unread count). */
  badge?: string
  /** Id of the dock group this entry collapses under, if any. */
  groupId?: string
  /**
   * A client script the hub imports into the host page (this devframe's **page
   * script**). An absolute-path `importFrom` is served by the hub under the
   * mount base and rewritten to that URL, so mounting by package name needs no
   * host wiring; a URL or bare specifier passes through untouched.
   */
  clientScript?: {
    /** An absolute filesystem path, a served URL, or a bare npm specifier. */
    importFrom: string
    /**
     * The name to import the module as.
     * @default 'default'
     */
    importName?: string
  }
}

/**
 * Runtime information threaded into `setup(ctx, info)`. Adapters
 * populate the fields that make sense for their deployment. In
 * particular, `createCac` fills `flags` with the parsed CAC bag.
 */
export interface DevframeSetupInfo {
  /** Parsed CLI flags, populated by the CLI adapter. */
  flags?: Record<string, unknown>
}

export interface DevframeDefinition {
  id: string
  name: string
  /** Semver of the tool, surfaced in hub UIs and diagnostics. */
  version: string
  /** npm package name the devframe ships in (e.g. `@scope/my-tool`). */
  packageName: string
  /**
   * `import.meta.url` of the module that defines this devframe. **Always
   * provide it** (`importMetaUrl: import.meta.url`): it is the resolution base
   * for the tool's own dependency graph, which lets the host resolve
   * everything against the plugin's own installed packages rather than the
   * consuming app's.
   *
   * - **Remote assets**: becomes the default `resolveFrom` for any remote
   *   {@link StaticAssetsSource} the devframe hosts (its `clientAssets`, and
   *   every `ctx.views.hostStatic` call) that doesn't set one explicitly, so a
   *   locally installed copy of the assets package is served with zero
   *   network. A per-asset `resolveFrom` still wins, and an explicit
   *   `resolveFrom: null` still opts out.
   * - **Service dependencies**: becomes the base the host resolves declared
   *   {@link DevframeServiceInput | services} from, so a plugin can ship a
   *   service package as its own dependency instead of asking users to install
   *   it.
   *
   * Optional for backward compatibility; omitting it falls back to
   * runtime-directory resolution and disables the zero-network installed-copy
   * fast paths above.
   */
  importMetaUrl?: string
  /** Project homepage or documentation URL. */
  homepage: string
  /** One-line summary of what the tool does. */
  description: string
  icon?: string | { light: string, dark: string }
  /**
   * Default dock attributes applied when a hub mounts this devframe as an
   * iframe dock entry. Consulted only by the hub install path (`ctx.install`),
   * which merge these beneath the per-mount `dock` overrides; standalone
   * adapters (`cli` / `build`) ignore it.
   *
   * @see {@link DevframeDockDefaults}
   */
  dock?: DevframeDockDefaults
  /**
   * Mount path override. Defaults depend on the adapter:
   * `/` for standalone (`cli` / `build`), `/__<id>/` for hosted
   * (`vite` / `embedded`).
   */
  basePath?: string
  /**
   * How a hub reacts when another devframe sharing this one's `id` is
   * mounted onto the same hub. Consulted only by hub adapters
   * (`ctx.install`); standalone adapters (`cli` / `build`)
   * ignore it.
   *
   * @default 'warn'
   */
  duplicationStrategy?: DevframeDuplicationStrategy
  /**
   * Declares which runtimes meaningfully support this devframe. Adapters
   * act on a `false` before doing any work:
   *
   * - `build: false`: `createCac` skips registering the `build` subcommand,
   *   and `createBuild` refuses (throws `DF0042`) unless `{ force: true }`.
   *   Useful for a devframe whose value is inherently live (e.g. it manages
   *   real files on disk), so a static export would only ever produce a
   *   broken, write-less shell of the tool.
   * - `dev: false`: `createDevServer` refuses (throws `DF0058`) unless
   *   `{ force: true }`. Useful for a devframe that only makes sense as a
   *   static export (e.g. a report generator with nothing to serve live).
   */
  capabilities?: {
    dev?: boolean
    build?: boolean
  }
  /**
   * Wire services this devframe consumes (see `DevframeServiceDefinition`).
   * Each entry is either a declarative descriptor
   * (`{ package, version?, required?, options? }`, where the host imports the
   * package's default-export factory, resolving it against **this plugin's
   * own dependencies**) or a ready `DevframeServiceDefinition` (the factory
   * was already called). The adapter queues these before `setup(ctx)` runs
   * and constructs each service once at the `ctx.services.ready()` barrier,
   * merging option sets across every declarer. Missing services are skipped
   * unless marked `required`; clients feature-detect via
   * `client.services.has(pkg)` and degrade.
   */
  services?: DevframeServiceInput[]
  /**
   * Author's SPA dist, served as the devframe's UI. A local directory, or
   * a {@link StaticAssetsSource} remote declaration (`{ package, version }`)
   * served through devframe's caching CDN back-proxy so the assets need not
   * ship inside the node package.
   *
   * Consumed by every adapter that serves the UI (`dev`, `build`, `vite`,
   * `next`, and the hub install path). When unset, the deprecated
   * {@link DevframeCliOptions.distDir} is read as a fallback.
   */
  clientAssets?: StaticAssetsSource
  /** RPC-level configuration for this devframe (see {@link DevframeRpcOptions}). */
  rpc?: DevframeRpcOptions
  /** Server-side setup: the primary entrypoint. Runs in every runtime. */
  setup: (ctx: DevframeNodeContext, info?: DevframeSetupInfo) => void | Promise<void>
  cli?: DevframeCliOptions
}

export interface DevframeRpcOptions {
  /**
   * Opt an RPC function into the static-build snapshot **without owning its
   * definition**, the mechanism a devframe uses to bake a wire service's
   * RPC (e.g. `@devframes/service-git`'s `status`/`log`/`show`) into its
   * `build` export, since the service itself defines no `dump`/`snapshot`.
   *
   * Each entry is either a bare method id (bakes the no-argument call, like
   * `snapshot: true`) or `{ method, inputs }` where `inputs` is the list of
   * argument-tuples to bake, or an async provider given the node context
   * (so it can enumerate at build time, e.g. read commit hashes via the
   * service's node API). `createBuild` resolves these after setup and
   * executes the target's own handler per tuple; the first tuple's result
   * becomes the fallback so any call variant resolves to a baked value.
   */
  snapshot?: DevframeSnapshotRpcEntry[]
}

/** Argument-tuples to bake for a {@link DevframeSnapshotRpcEntry}, or a provider that computes them at build time. */
export type DevframeSnapshotRpcInputs
  = readonly (readonly unknown[])[]
    | ((ctx: DevframeNodeContext) => readonly (readonly unknown[])[] | Promise<readonly (readonly unknown[])[]>)

/**
 * One {@link DevframeRpcOptions.snapshot} entry: a bare method id (bakes
 * the no-argument call) or a method plus the argument-tuples to bake.
 */
export type DevframeSnapshotRpcEntry
  = string
    | { method: string, inputs: DevframeSnapshotRpcInputs }
