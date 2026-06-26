import type { CAC } from 'cac'
import type { CliFlagsSchema } from '../adapters/flags'
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
   * Skip the RPC trust handshake. Set to `false` for trusted
   * single-user localhost tools. Default `true`.
   *
   * Forwarded to `startHttpAndWs` as a no-op placeholder until devframe
   * ships its own auth layer; `@vitejs/devtools` honors the equivalent
   * `devtools.clientAuth` today.
   */
  auth?: boolean
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
   * but before `createCli`'s own `configureCli` caller. Use this to
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
 * particular, `createCli` fills `flags` with the parsed CAC bag.
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
