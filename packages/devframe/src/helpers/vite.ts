import type { DevframeAuthHandler } from '../node/auth/handler'
import type { DevframeDefinition, McpRouteOptions } from '../types/devframe'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { resolve } from 'pathe'
import { normalizeBasePath, resolveBasePath } from '../adapters/_shared'
import { createDevServer, resolveDevServerPort, resolveMcpConnectionMeta } from '../adapters/dev'
import { DEVFRAME_CONNECTION_META_FILENAME, DEVFRAME_WS_ROUTE } from '../constants'
import { diagnostics } from '../node/diagnostics'

export interface ViteDevBridgeOptions {
  /**
   * Mount base. Defaults to `def.basePath ?? '/__<id>/'` for this hosted
   * adapter — the devframe shares the origin with the host Vite app.
   *
   * Relative spellings like `'./'` (common for base-agnostic Nuxt builds)
   * are normalized to absolute paths so they compose with Vite's connect
   * router.
   */
  base?: string
  /**
   * Dev-time middleware mode. When set, the host app owns the SPA and
   * devframe spins up a separate RPC + WS server on a resolved port,
   * registering Vite middleware at `<base>__connection.json` so the
   * host-served SPA can discover the WS endpoint.
   *
   *  - `false` (default) — static-mount the SPA at `base` with SPA
   *    fallback. No RPC server is started.
   *  - `true` — bridge mode with all defaults (port from
   *    {@link resolveDevServerPort}, host from `def.cli?.host`).
   *  - object — bridge mode with explicit overrides.
   */
  devMiddleware?: boolean | {
    /** Override the bridge port. Default: {@link resolveDevServerPort}. */
    port?: number
    /** Override the bridge bind host. Default: `def.cli?.host ?? 'localhost'`. */
    host?: string
    /** Flag bag forwarded to `def.setup(ctx, { flags })`. */
    flags?: Record<string, unknown>
  }
  /**
   * Whether the bridged devframe runs its own auth gate. The side-car RPC
   * server is reachable by anything that can open its socket, so it **gates by
   * default**: when unset, authentication resolves through `createDevServer`
   * (devframe's interactive OTP gate unless the definition's `cli.auth` opts
   * out), and the side-car prints its code/link banner to stdout. Pass a
   * {@link DevframeAuthHandler} to install a custom scheme, or `false` to opt
   * out for a single-user localhost host that owns the trust boundary another
   * way. Only applies in bridge mode (`devMiddleware`); the static-mount mode
   * starts no RPC server.
   *
   * @default gated (devframe's interactive OTP, unless `cli.auth` opts out)
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Expose the side-car's route-based MCP server (Streamable-HTTP) and
   * advertise it in the bridge's `__connection.json`. Forwarded to
   * {@link createDevServer}: overrides `def.cli?.mcp`, `undefined` falls
   * through to it, `false` disables the route regardless. Only applies in
   * bridge mode (`devMiddleware`); the static-mount mode starts no server.
   *
   * The endpoint lives on the side-car's own port, so the advertised meta
   * carries `{ port, path }` — see `ConnectionMeta['mcp']`.
   *
   * @experimental
   */
  mcp?: boolean | McpRouteOptions
}

export interface DevframeVitePlugin {
  name: string
  apply: 'serve'
  configureServer: (server: {
    middlewares: { use: (path: string, handler: any) => void }
    httpServer?: { once: (event: 'close', cb: () => void) => void } | null
  }) => void | Promise<void>
  closeBundle?: () => void | Promise<void>
}

/**
 * Bridge a devframe into an existing Vite dev server. Returns a Vite
 * plugin with two modes, picked via `options.devMiddleware`:
 *
 *   - **static-mount mode** (default) — mounts `def.cli.distDir` at
 *     `options.base` with SPA fallback enabled. No RPC server is started.
 *
 *   - **bridge mode** (`devMiddleware: true | {…}`) — skips the static
 *     mount; the host app owns the SPA. Devframe starts a separate
 *     RPC + WS dev server (via {@link createDevServer} in bridge mode)
 *     and registers Vite middleware at `<base>__connection.json` so the
 *     host-served SPA can discover the WS endpoint via
 *     {@link connectDevframe}.
 *
 * The side-car RPC server **gates by default** (devframe's interactive OTP
 * unless the definition's `cli.auth` opts out), printing its code/link banner
 * to stdout, so a bridged devframe isn't silently reachable by anything that
 * can open its socket. Pass `options.auth: false` to opt out for a single-user
 * localhost host, or a {@link DevframeAuthHandler} for a custom scheme.
 *
 * Use bridge mode when integrating with frameworks that own the SPA
 * (Nuxt, Astro, SolidStart, plain Vite apps). For the all-in-one
 * `dev` / `build` / `mcp` shell, reach for {@link createCac} instead.
 */
export function viteDevBridge(d: DevframeDefinition, options: ViteDevBridgeOptions = {}): DevframeVitePlugin {
  const base = normalizeMountBase(options.base ?? resolveBasePath(d, 'hosted'))

  if (!options.devMiddleware) {
    const distDir = d.cli?.distDir
    return {
      name: `devframe:${d.id}`,
      apply: 'serve',
      configureServer(server) {
        if (!distDir)
          return
        server.middlewares.use(base, serveStaticNodeMiddleware(resolve(distDir)))
      },
    }
  }

  const mw = options.devMiddleware === true ? {} : options.devMiddleware
  let started: Awaited<ReturnType<typeof createDevServer>> | undefined

  return {
    name: `devframe:${d.id}`,
    apply: 'serve',
    async configureServer(server) {
      // Vite re-invokes `configureServer` on each restart cycle; close
      // the prior handle so we don't leak the WS server. Silent catch —
      // a stale handle's close failure shouldn't block a fresh start.
      await started?.close().catch(() => {})
      started = undefined

      let port: number
      try {
        port = mw.port ?? await resolveDevServerPort(d, { host: mw.host })
        started = await createDevServer(d, {
          host: mw.host,
          port,
          flags: mw.flags,
          openBrowser: false,
          // Gate by default: an unset `auth` defers to `createDevServer`
          // (devframe's interactive OTP unless `cli.auth` opts out) rather than
          // leaving the side-car socket ungated. `false` opts out explicitly.
          auth: options.auth,
          mcp: options.mcp,
        })
      }
      catch (e) {
        diagnostics.DF0033({ id: d.id, reason: String(e), cause: e as Error }, { method: 'warn' })
        return
      }

      // The side-car listens on its own port, so the browser must target that
      // port explicitly (it can't reach the WS on Vite's origin). The route is
      // `/__devframe_ws` — the bridge `createDevServer` mounts the SPA at `/`, so its WS
      // upgrade handler is bound there. The MCP route (when enabled) lives on
      // the same side-car origin, advertised with the same explicit port.
      const mcpMeta = resolveMcpConnectionMeta(d, options.mcp, port)
      const metaPath = `${base}${DEVFRAME_CONNECTION_META_FILENAME}`
      server.middlewares.use(metaPath, (_req: unknown, res: any) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          backend: 'websocket',
          websocket: { port, path: `/${DEVFRAME_WS_ROUTE}` },
          ...(mcpMeta ? { mcp: mcpMeta } : {}),
        }))
      })

      server.httpServer?.once('close', () => {
        void started?.close().catch(() => {})
      })
    },

    async closeBundle() {
      await started?.close().catch(() => {})
      started = undefined
    },
  }
}

/**
 * Make `base` safe for `server.middlewares.use(path, …)`. Vite's connect
 * router matches by absolute URL prefix, so relative spellings like
 * `'./'` (commonly used for base-agnostic Nuxt builds) collapse to the
 * origin root before the shared leading/trailing-slash normalization.
 */
function normalizeMountBase(base: string): string {
  return normalizeBasePath(base.replace(/^\.\/?/, '/'))
}
