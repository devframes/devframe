import type { CreateDevServerOptions } from 'devframe/adapters/dev'
import type { StartedServer } from 'devframe/node'
import type { DevframeDefinition, DevframeStorageScope } from 'devframe/types'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createDevServer, resolveDevServerPort, resolveMcpConnectionMeta } from 'devframe/adapters/dev'
import { DEVFRAME_WS_ROUTE } from 'devframe/constants'
import { createDevframeNextHost } from './host'

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
   * Whether the side-car runs its own auth gate. **Gates by default** (defers
   * to `createDevServer` — devframe's interactive OTP unless the definition's
   * `cli.auth` opts out), so the side-car socket isn't silently reachable by
   * anything that can open it. Pass `false` to opt out for a single-user
   * localhost host, or a handler for a custom scheme.
   */
  auth?: CreateDevServerOptions['auth']
  /** Origin the Next app is reachable at, for docks needing an absolute URL. */
  resolveOrigin?: () => string
  /** Override where persisted devframe state lives (defaults under the cwd / home). */
  getStorageDir?: (scope: DevframeStorageScope) => string
  /**
   * Expose the side-car's route-based MCP server (Streamable-HTTP) and
   * advertise it in the handler's `__connection.json`. Forwarded to
   * `createDevServer`: overrides `def.cli?.mcp`, `undefined` falls through to
   * it, `false` disables the route regardless. The endpoint lives on the
   * side-car's own port, so the advertised meta carries `{ port, path }`.
   *
   * @experimental
   */
  mcp?: CreateDevServerOptions['mcp']
}

export interface DevframeNextHandler {
  /**
   * WHATWG-`fetch` handler for the catch-all App Router route. Serves the
   * plugin's built SPA at `base` and answers `<base>/__connection.json` with
   * the side-car WS endpoint. Awaits {@link DevframeNextHandler.ready} so the
   * first request doesn't race the server boot.
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
 * Host a **single** devframe from a Next.js App Router app — the convenience
 * wrapper over {@link createDevframeNextHost} for the common case of mounting
 * one plugin (the Next counterpart to `viteDevBridge`'s bridge mode).
 *
 * It statically serves `def.cli.distDir` at `base` through the Next route and
 * starts a side-car RPC/WS dev server (via `createDevServer` in bridge mode) on
 * its own port, advertising that endpoint at `<base>/__connection.json` so the
 * SPA's `connectDevframe()` can dial back in.
 *
 * ```ts [app/__my-tool/[[...path]]/route.ts]
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
 * For a hub hosting many devframes at once, use {@link createDevframeNextHost}
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
  const hostName = options.host ?? def.cli?.host

  const nextHost = createDevframeNextHost({
    resolveOrigin: options.resolveOrigin ?? (() => ''),
    getStorageDir: options.getStorageDir ?? defaultGetStorageDir,
  })
  nextHost.host.mountStatic(base, distDir)
  nextHost.host.mountConnectionMeta?.(base)

  let started: StartedServer | undefined
  const ready = (async () => {
    const port = options.port ?? await resolveDevServerPort(def, { host: hostName })
    // Bridge mode: no `distDir` passed, so the side-car serves only the WS
    // endpoint + meta on its own port; the Next route serves the SPA. The
    // side-car mounts the WS at `/<route>` on the standalone base.
    started = await createDevServer(def, {
      host: hostName,
      port,
      flags: options.flags,
      openBrowser: false,
      // Gate by default: an unset `auth` defers to `createDevServer` rather
      // than leaving the side-car socket ungated. `false` opts out explicitly.
      auth: options.auth,
      mcp: options.mcp,
    })
    const mcpMeta = resolveMcpConnectionMeta(def, options.mcp, port)
    nextHost.setConnectionMeta({
      backend: 'websocket',
      websocket: { port, path: `/${DEVFRAME_WS_ROUTE}` },
      ...(mcpMeta ? { mcp: mcpMeta } : {}),
    })
  })()

  return {
    async fetch(request) {
      await ready
      return nextHost.fetch(request)
    },
    ready,
    async close() {
      await ready.catch(() => {})
      await started?.close()
    },
  }
}
