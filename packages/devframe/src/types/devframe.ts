import type { CAC } from 'cac'
import type { CliFlagsSchema } from '../adapters/flags'
import type { DevframeAuthHandler } from '../node/auth/handler'
import type { DevframeNodeContext } from './context'

export type DevframeRuntime = 'cli' | 'build' | 'spa' | 'vite' | 'embedded'

/**
 * Classification of how a devframe is being deployed. Hosted adapters
 * (`vite`, `embedded`) share their origin with a host app and must
 * namespace their mount path under `/__<id>/`. Standalone adapters
 * (`cli`, `spa`, `build`) own the origin and default to `/`.
 */
export type DevframeDeploymentKind = 'standalone' | 'hosted'

/**
 * How a hub deduplicates devframes that share an `id` when more than one
 * is mounted onto the same hub. See {@link DevframeDefinition.duplicationStrategy}.
 *
 * - `'warn'` (default) — keep the first registration, drop later
 *   duplicates, and emit a warning diagnostic (`DF8105`).
 * - `'silent'` — drop later duplicates without warning.
 * - `'throw'` — throw when a duplicate is mounted.
 * - `'duplicate'` — let every instance coexist under a disambiguated
 *   dock id.
 */
export type DevframeDuplicationStrategy = 'warn' | 'silent' | 'throw' | 'duplicate'

/**
 * Controls where the browser opens the RPC WebSocket — advertised in
 * `__connection.json` and used to bind the dev server. The three shapes map
 * to the three connection scenarios; precedence is `url` > `port` > `route`:
 *
 *   1. **Same server, different route** (default) — leave `port`/`url` unset.
 *      The socket shares the HTTP server's port and binds to `route`
 *      (`__devframe_ws`). The client connects to its own origin, so the link
 *      survives a reverse proxy that rewrites the host/port/subpath.
 *
 *   2. **Different port** — set `port`. The socket binds on its own port on the
 *      same host; the client targets `ws(s)://<page-host>:<port>/<route>`.
 *
 *   3. **Remote, different origin** — set `url` to a full `ws://`/`wss://`
 *      endpoint (e.g. a public tunnel or relay). The client uses it verbatim.
 */
export interface DevframeWsOptions {
  /**
   * Upgrade route segment the socket binds to and is advertised at, relative
   * to the SPA base. Default: `__devframe_ws`.
   */
  route?: string
  /**
   * Bind the socket on its own port instead of sharing the HTTP port. The
   * browser connects to this port on the page's hostname.
   */
  port?: number
  /**
   * Advertise a fixed, fully-qualified endpoint on another origin (a full
   * `ws://`/`wss://` URL). Takes precedence over `port`/`route` in the meta.
   */
  url?: string
}

/**
 * Configuration for the route-based MCP server mounted alongside the dev
 * server (opt-in via {@link DevframeCliOptions.mcp}). The endpoint speaks
 * the MCP Streamable-HTTP transport over the same origin as the SPA,
 * exposing the definition's `ctx.agent` tools + shared-state resources to
 * external MCP clients connected to the *running* server.
 *
 * @experimental The agent-native surface is experimental and may change
 * without a major version bump until it stabilizes.
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
   * This is the endpoint's DNS-rebinding protection — the shared
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
   *   - `undefined` / `true` (default) — the standalone adapters (`cli` /
   *     `spa` / served `build`) auto-wire devframe's interactive OTP auth
   *     (`createInteractiveAuth`): an untrusted client can only reach
   *     `anonymous:` methods until it exchanges the printed one-time code.
   *     The adapter prints the code + magic-link banner once the server is
   *     listening.
   *   - `false` — no gate, for trusted single-user localhost tools where an
   *     auth round-trip only gets in the way (the built-in plugins set this).
   *     The `--no-auth` CLI flag maps here for one-off runs.
   *   - A {@link DevframeAuthHandler} — a custom handler (e.g. a tuned
   *     `createInteractiveAuth`, or an entirely different scheme) passed
   *     straight through to `startHttpAndWs`.
   *
   * Hosted adapters (`vite`, `embedded`) ignore this and defer to the host's
   * auth; `@vitejs/devtools` honors the equivalent `devtools.clientAuth`.
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Expose a route-based MCP server alongside the dev server, speaking the
   * MCP Streamable-HTTP transport at `/__mcp` (relative to the base path).
   * It surfaces the same `ctx.agent` tools + shared-state resources as the
   * stdio `mcp` command, but against the live, running server.
   *
   * - `false` / omitted (default) — no MCP route is mounted.
   * - `true` — mount at the default `__mcp` route with the loopback-only
   *   origin gate.
   * - {@link McpRouteOptions} — customise the route path / allowed origins.
   *
   * The `--mcp` / `--no-mcp` CLI flags override this per run.
   *
   * @experimental
   */
  mcp?: boolean | McpRouteOptions
  /** Author's SPA dist directory (served as the devframe's UI). */
  distDir?: string
  /**
   * How the browser reaches the RPC WebSocket. Defaults to sharing the HTTP
   * port on the `__devframe_ws` route. See {@link DevframeWsOptions} for the
   * different-port and remote-origin variants.
   */
  ws?: DevframeWsOptions
  /**
   * Capability-side CAC hook. Called with the CAC instance after the
   * adapter registers its built-in commands (`build` / `spa` / `mcp`)
   * but before `createCac`'s own `configureCli` caller. Use this to
   * contribute tool-specific flags and subcommands from the definition
   * itself.
   */
  configure?: (cli: CAC) => void
  /**
   * Typed CLI flags for the default `dev` command, backed by valibot
   * schemas. The adapter registers matching `--kebab-key` options on
   * CAC, validates the parsed values, and forwards the typed bag to
   * `setup(ctx, { flags })`.
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
 * mounts this devframe. Framework-neutral metadata only — the hub layer
 * (`mountDevframe`) merges these beneath its per-mount `dock` overrides,
 * which in turn sit beneath the locked, derived `id` / `type` / `url`.
 *
 * Every field is optional. `title` / `icon` default to the definition's
 * `name` / `icon` when omitted here; the rest are unset by default.
 * Standalone adapters (`cli` / `spa` / `build`) ignore this entirely.
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
  /** Badge text rendered on the dock icon (e.g. an unread count). */
  badge?: string
  /** Id of the dock group this entry collapses under, if any. */
  groupId?: string
}

export interface DevframeSpaOptions {
  base?: string
  /**
   * How the deployed SPA loads its data.
   * - `'query'` — read from URL search params.
   * - `'upload'` — accept a file drag-drop.
   * - `'none'`  — use the baked RPC dump only.
   */
  loader?: 'query' | 'upload' | 'none'
}

export interface DevframeBrowserContext {
  /**
   * The connected RPC client (may be write-disabled in static/spa modes).
   */
  rpc: unknown
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
  /** Project homepage or documentation URL. */
  homepage: string
  /** One-line summary of what the tool does. */
  description: string
  icon?: string | { light: string, dark: string }
  /**
   * Default dock attributes applied when a hub mounts this devframe as an
   * iframe dock entry. Consulted only by hub adapters (`mountDevframe`),
   * which merge these beneath the per-mount `dock` overrides; standalone
   * adapters (`cli` / `spa` / `build`) ignore it.
   *
   * @see {@link DevframeDockDefaults}
   */
  dock?: DevframeDockDefaults
  /**
   * Mount path override. Defaults depend on the adapter:
   * `/` for standalone (`cli` / `spa` / `build`), `/__<id>/` for hosted
   * (`vite` / `embedded`).
   */
  basePath?: string
  /**
   * How a hub reacts when another devframe sharing this one's `id` is
   * mounted onto the same hub. Consulted only by hub adapters
   * (`mountDevframe`); standalone adapters (`cli` / `spa` / `build`)
   * ignore it.
   *
   * @default 'warn'
   */
  duplicationStrategy?: DevframeDuplicationStrategy
  capabilities?: {
    dev?: boolean | Record<string, boolean>
    build?: boolean | Record<string, boolean>
    spa?: boolean | Record<string, boolean>
  }
  /** Server-side setup — the primary entrypoint. Runs in every runtime. */
  setup: (ctx: DevframeNodeContext, info?: DevframeSetupInfo) => void | Promise<void>
  /** Browser-only setup for the SPA adapter (bundled into the client). */
  setupBrowser?: (ctx: DevframeBrowserContext) => void | Promise<void>
  cli?: DevframeCliOptions
  spa?: DevframeSpaOptions
}

export function defineDevframe(d: DevframeDefinition): DevframeDefinition {
  return d
}
