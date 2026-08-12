import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { DevframeInstance } from '../adapters/initiate'
import type { DevframeAuthHandler } from '../node/auth/handler'
import type { DevframeDefinition, McpRouteOptions } from '../types/devframe'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { resolve } from 'pathe'
import { normalizeBasePath, resolveBasePath } from '../adapters/_shared'
import { initDevframe } from '../adapters/initiate'
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
   * devframe serves the RPC surface through the Vite dev server itself —
   * `<base>__connection.json` for discovery and the WebSocket upgrade at
   * `<base>__ws` on Vite's own HTTP server (zero extra ports, proxy/HTTPS
   * friendly). When Vite runs in middleware mode (no `httpServer`) — or a
   * `port` is pinned — the socket falls back to a side-car server on its
   * own port instead.
   *
   *  - `false` (default) — static-mount the SPA at `base` with SPA
   *    fallback. No RPC server is started.
   *  - `true` — bridge mode with all defaults.
   *  - object — bridge mode with explicit overrides.
   */
  devMiddleware?: boolean | {
    /**
     * Pin a side-car port for the RPC socket instead of sharing Vite's
     * server. Default: share Vite's HTTP server (side-car only when Vite
     * has none).
     */
    port?: number
    /** Override the side-car bind host. Default: `def.cli?.host ?? 'localhost'`. */
    host?: string
    /** Flag bag forwarded to `def.setup(ctx, { flags })`. */
    flags?: Record<string, unknown>
  }
  /**
   * Whether the bridged devframe runs its own auth gate. The RPC endpoint is
   * reachable by anything that can open its socket, so it **gates by
   * default**: when unset, authentication resolves through devframe's
   * interactive OTP gate (unless the definition's `cli.auth` opts out), and
   * the bridge prints its code/link banner to stdout. Pass a
   * {@link DevframeAuthHandler} to install a custom scheme, or `false` to opt
   * out for a single-user localhost host that owns the trust boundary another
   * way. Only applies in bridge mode (`devMiddleware`); the static-mount mode
   * starts no RPC server.
   *
   * @default gated (devframe's interactive OTP, unless `cli.auth` opts out)
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Expose the bridge's route-based MCP server (Streamable-HTTP) at
   * `<base>__mcp` — on the Vite app's own origin — and advertise it in the
   * bridge's `__connection.json`. Overrides `def.cli?.mcp`, `undefined`
   * falls through to it, `false` disables the route regardless. Only applies
   * in bridge mode (`devMiddleware`); the static-mount mode starts no server.
   *
   * @experimental
   */
  mcp?: boolean | McpRouteOptions
}

/** The slice of a Vite dev server the bridge plugin touches. */
export interface DevframeViteDevServerLike {
  middlewares: {
    use: ((path: string, handler: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void) => void)
      & ((handler: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void) => void)
  }
  httpServer?: NodeHttpServer | null
}

export interface DevframeVitePlugin {
  name: string
  apply: 'serve'
  configureServer: (server: DevframeViteDevServerLike) => void | Promise<void>
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
 *     mount; the host app owns the SPA. Devframe serves discovery
 *     (`<base>__connection.json`), the WebSocket RPC upgrade
 *     (`<base>__ws`, shared on Vite's own HTTP server), and the optional
 *     MCP route through {@link initDevframe}'s node middleware, so the
 *     host-served SPA can discover the endpoint via {@link connectDevframe}.
 *
 * The bridge **gates by default** (devframe's interactive OTP unless the
 * definition's `cli.auth` opts out), printing its code/link banner to stdout,
 * so a bridged devframe isn't silently reachable by anything that can open
 * its socket. Pass `options.auth: false` to opt out for a single-user
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
  let instance: DevframeInstance | undefined

  return {
    name: `devframe:${d.id}`,
    apply: 'serve',
    async configureServer(server) {
      // Vite re-invokes `configureServer` on each restart cycle; close
      // the prior handle so we don't leak the WS transport. Silent catch —
      // a stale handle's close failure shouldn't block a fresh start.
      await instance?.close().catch(() => {})
      instance = undefined

      try {
        const created = initDevframe(d, {
          base,
          // The host app owns the SPA in bridge mode — never mount the
          // definition's own distDir here.
          distDir: false,
          flags: mw.flags,
          host: mw.host,
          // Pinned port → explicit side-car. Otherwise share Vite's own
          // HTTP server; a middleware-mode Vite (no httpServer) has no
          // upgrade to share, so ask for an auto-port side-car instead.
          ...(mw.port != null
            ? { ws: { port: mw.port } }
            : server.httpServer
              ? { server: server.httpServer }
              : { ws: { sidecar: true } }),
          // Gate by default: an unset `auth` defers to the handler
          // (devframe's interactive OTP unless `cli.auth` opts out) rather
          // than leaving the socket ungated. `false` opts out explicitly.
          auth: options.auth,
          mcp: options.mcp,
        })
        server.middlewares.use(created.nodeMiddleware)
        await created.ready
        instance = created
      }
      catch (e) {
        diagnostics.DF0033({ id: d.id, reason: String(e), cause: e as Error }, { method: 'warn' })
        return
      }

      server.httpServer?.once('close', () => {
        void instance?.close().catch(() => {})
      })
    },

    async closeBundle() {
      await instance?.close().catch(() => {})
      instance = undefined
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
