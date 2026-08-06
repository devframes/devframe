import type { InitDevframeOptions } from 'devframe/initiate'
import type { DevframeDefinition, DevframeStorageScope } from 'devframe/types'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { initDevframe } from 'devframe/initiate'

export interface CreateDevframeNextHandlerOptions {
  /**
   * Mount base for the SPA. Defaults to `def.basePath ?? '/__<id>/'` — the
   * hosted-adapter default, so the devframe shares the Next app's origin
   * without colliding with its routes.
   */
  base?: string
  /** Bind host for the side-car RPC/WS server. Default: `def.cli?.host ?? 'localhost'`. */
  host?: string
  /** Pin the side-car port. Default: resolved from `def.cli?.port` via `get-port-please`. */
  port?: number
  /** Flag bag forwarded to `def.setup(ctx, { flags })`. */
  flags?: Record<string, unknown>
  /**
   * Whether the side-car runs its own auth gate. **Gates by default**
   * (devframe's interactive OTP unless the definition's `cli.auth` opts
   * out), so the side-car socket isn't silently reachable by anything that
   * can open it. Pass `false` to opt out for a single-user localhost host,
   * or a handler for a custom scheme.
   */
  auth?: InitDevframeOptions['auth']
  /** Origin the Next app is reachable at, for docks needing an absolute URL. */
  resolveOrigin?: () => string
  /** Override where persisted devframe state lives (defaults under the cwd / home). */
  getStorageDir?: (scope: DevframeStorageScope) => string
  /**
   * Expose the route-based MCP server (Streamable-HTTP) at `<base>__mcp` —
   * on the Next app's own origin, through the same catch-all route as the
   * SPA — and advertise it in the handler's `__connection.json`. Overrides
   * `def.cli?.mcp`, `undefined` falls through to it, `false` disables the
   * route regardless.
   *
   * @experimental
   */
  mcp?: InitDevframeOptions['mcp']
  /**
   * Memoization key for the underlying `initDevframe` instance. Next re-runs
   * route modules across dev-time reloads; the key makes a re-run return the
   * live instance instead of leaking side-car servers. Default:
   * `@devframes/next:<def.id>:<base>`.
   */
  key?: string
}

export interface DevframeNextHandler {
  /**
   * WHATWG-`fetch` handler for the catch-all App Router route. Serves the
   * plugin's built SPA at `base` and answers `<base>__connection.json` with
   * the RPC endpoint. Awaits {@link DevframeNextHandler.ready} so the first
   * request doesn't race the server boot.
   */
  fetch: (request: Request) => Promise<Response>
  /** Resolves once the side-car RPC/WS server is listening. */
  ready: Promise<void>
  /** Shut the side-car server down (call from an app-lifecycle hook / test). */
  close: () => Promise<void>
}

/** Ensure a mount base has a single leading and trailing slash. */
function normalizeBase(base: string): string {
  return `/${base}/`.replace(/\/{2,}/g, '/')
}

function defaultGetStorageDir(scope: DevframeStorageScope): string {
  const cwd = process.cwd()
  if (scope === 'workspace')
    return join(cwd, '.devframe')
  if (scope === 'project')
    return join(cwd, 'node_modules/.devframe')
  return join(homedir(), '.devframe')
}

/**
 * Host a **single** devframe from a Next.js App Router app — the Next
 * counterpart to `viteDevBridge`, reduced to memoization + defaults over
 * `initDevframe` (Next's route handlers can't accept WS upgrades, so the
 * RPC socket lives on the instance's side-car port, advertised at
 * `<base>__connection.json`).
 *
 * ```ts [app/%5F_my-tool/[[...path]]/route.ts]
 * import myDevframe from '@/devframe'
 * import { createDevframeNextHandler } from '@devframes/next'
 *
 * export const runtime = 'nodejs'
 * export const dynamic = 'force-dynamic'
 *
 * const handler = createDevframeNextHandler(myDevframe)
 * export const GET = handler.fetch
 * ```
 *
 * For a hub hosting many devframes at once, use `createDevframeNextHost`
 * directly with `@devframes/hub`.
 */
export function createDevframeNextHandler(
  def: DevframeDefinition,
  options: CreateDevframeNextHandlerOptions = {},
): DevframeNextHandler {
  const distDir = def.cli?.distDir
  if (!distDir) {
    throw new Error(
      `[@devframes/next] createDevframeNextHandler("${def.id}") needs a built SPA to serve, but "cli.distDir" is not set on the devframe definition.`,
    )
  }

  const base = normalizeBase(options.base ?? def.basePath ?? `/__${def.id}/`)

  const instance = initDevframe(def, {
    base,
    distDir,
    host: options.host,
    flags: options.flags,
    // Gate by default: an unset `auth` defers to the instance (devframe's
    // interactive OTP unless `cli.auth` opts out). `false` opts out.
    auth: options.auth,
    mcp: options.mcp,
    ...(options.port != null ? { ws: { port: options.port } } : {}),
    ...(options.resolveOrigin ? { origin: options.resolveOrigin } : {}),
    getStorageDir: options.getStorageDir ?? defaultGetStorageDir,
    key: options.key ?? `@devframes/next:${def.id}:${base}`,
  })

  return {
    fetch: request => instance.handler(request),
    ready: instance.ready,
    close: instance.close,
  }
}
