import type { DevframeDefinition, McpRouteOptions } from 'devframe'
import type { DevframeInstance } from 'devframe/initiate'
import type { DevframeAuthHandler } from 'devframe/node/auth'
import type { IncomingMessage, Server as NodeHttpServer, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import process from 'node:process'
import { initDevframe } from 'devframe/initiate'
import { diagnostics, normalizeBasePath, resolveBasePath, resolveClientAssets } from 'devframe/internal'
import { resolveStaticAssetsSource } from 'devframe/utils/remote-assets'
import { serveStaticNodeMiddleware } from 'devframe/utils/serve-static'
import { join, resolve } from 'pathe'

/**
 * The slice of a Vite dev server these plugins touch — deliberately
 * narrower than Vite's real `ViteDevServer` (which carries the module
 * graph, watcher, transform pipeline, …) so a host can hand a plugin
 * anything shaped like this, and a test double only needs to fake two
 * fields. A real `ViteDevServer` satisfies this structurally, so each
 * plugin's `configureServer(server: ViteDevServer)` hook (typed against
 * the real `Plugin` below) is still fully type-safe.
 */
export interface DevframeViteDevServerLike {
  middlewares: {
    use: ((path: string, handler: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void) => void)
      & ((handler: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void) => void)
  }
  /**
   * Deliberately structural (just the one event these plugins listen for)
   * rather than `NodeHttpServer` — Vite's real `ViteDevServer.httpServer`
   * is `http.Server | Http2SecureServer | null`, and `Http2SecureServer`
   * doesn't satisfy `http.Server`'s full shape.
   */
  httpServer?: { once: (event: 'close', listener: () => void) => unknown } | null
}

/** A devframe Vite plugin — a real Vite `Plugin`, scoped to its `serve`-only hooks. */
export type DevframeVitePlugin = Plugin

export interface DevframeVitePluginOptions {
  /**
   * Mount base. Defaults to `def.basePath ?? '/__<id>/'` for this hosted
   * adapter — the devframe shares the origin with the host Vite app.
   *
   * Relative spellings like `'./'` (common for base-agnostic Nuxt builds)
   * are normalized to absolute paths so they compose with Vite's connect
   * router.
   */
  base?: string
}

/**
 * Statically mount a devframe's built SPA (`def.clientAssets`) at
 * `options.base` inside an existing Vite dev server. No RPC server is
 * started — reach for {@link devframeViteBridge} when the mounted UI
 * needs a live RPC/WebSocket connection back to the devframe.
 *
 * Use this when the devframe ships its own pre-built UI and the host
 * only needs to serve it alongside its own app (e.g. a devtools dock
 * whose backend runs elsewhere, or a hub that only wants the static
 * assets).
 */
export function devframeVitePlugin(d: DevframeDefinition, options: DevframeVitePluginOptions = {}): DevframeVitePlugin {
  const base = normalizeMountBase(options.base ?? resolveBasePath(d, 'hosted'))
  const distDir = resolveClientAssets(d)

  return {
    name: `devframe:${d.id}`,
    apply: 'serve',
    configureServer(server: DevframeViteDevServerLike) {
      if (!distDir)
        return
      // Remote-assets sources resolve to the locally installed assets
      // package when present, otherwise to a caching CDN back-proxy, under
      // the h3 host's `project` storage convention.
      const source = resolveStaticAssetsSource(distDir, join(process.cwd(), 'node_modules', `.${d.id}`, 'devframe'), d.importMetaUrl)
      server.middlewares.use(base, serveStaticNodeMiddleware(typeof source === 'string' ? resolve(source) : source))
    },
  }
}

export interface DevframeViteBridgeOptions {
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
   * Pin a side-car port for the RPC socket instead of sharing Vite's
   * server. Default: share Vite's HTTP server (side-car only when Vite
   * has none).
   */
  port?: number
  /** Override the side-car bind host. Default: `def.cli?.host ?? 'localhost'`. */
  host?: string
  /** Flag bag forwarded to `def.setup(ctx, { flags })`. */
  flags?: Record<string, unknown>
  /**
   * Whether the bridged devframe runs its own auth gate. The RPC endpoint is
   * reachable by anything that can open its socket, so it **gates by
   * default**: when unset, authentication resolves through devframe's
   * interactive OTP gate (unless the definition's `cli.auth` opts out), and
   * the bridge prints its code/link banner to stdout. Pass a
   * {@link DevframeAuthHandler} to install a custom scheme, or `false` to opt
   * out for a single-user localhost host that owns the trust boundary
   * another way.
   *
   * @default gated (devframe's interactive OTP, unless `cli.auth` opts out)
   */
  auth?: boolean | DevframeAuthHandler
  /**
   * Expose the bridge's route-based MCP server (Streamable-HTTP) at
   * `<base>__mcp` — on the Vite app's own origin — and advertise it in the
   * bridge's `__connection.json`. Overrides `def.cli?.mcp`, `undefined`
   * falls through to it, `false` disables the route regardless.
   */
  mcp?: boolean | McpRouteOptions
}

/**
 * Bridge a devframe's RPC + WebSocket backend into an existing Vite dev
 * server: the host app owns the SPA (`clientAssets` is never mounted), and this
 * plugin serves discovery (`<base>__connection.json`), the WebSocket RPC
 * upgrade (`<base>__ws`, shared on Vite's own HTTP server), and the
 * optional MCP route through {@link initDevframe}'s node middleware — so
 * the host-served SPA can discover the endpoint via `connectDevframe`.
 *
 * The bridge **gates by default** (devframe's interactive OTP unless the
 * definition's `cli.auth` opts out), printing its code/link banner to
 * stdout, so a bridged devframe isn't silently reachable by anything that
 * can open its socket. Pass `options.auth: false` to opt out for a
 * single-user localhost host, or a {@link DevframeAuthHandler} for a
 * custom scheme.
 *
 * Use this when integrating with frameworks that own the SPA (Nuxt, Astro,
 * SolidStart, plain Vite apps). Reach for {@link devframeVitePlugin} instead
 * when the devframe just needs to serve its own pre-built UI with no live
 * backend, or `createCac` (`devframe/adapters/cac`) for the all-in-one
 * `dev` / `build` / `mcp` shell.
 */
export function devframeViteBridge(d: DevframeDefinition, options: DevframeViteBridgeOptions = {}): DevframeVitePlugin {
  const base = normalizeMountBase(options.base ?? resolveBasePath(d, 'hosted'))
  let instance: DevframeInstance | undefined

  return {
    name: `devframe:${d.id}`,
    apply: 'serve',
    async configureServer(server: DevframeViteDevServerLike) {
      // Vite re-invokes `configureServer` on each restart cycle; close
      // the prior handle so we don't leak the WS transport. Silent catch —
      // a stale handle's close failure shouldn't block a fresh start.
      await instance?.close().catch(() => {})
      instance = undefined

      try {
        const created = initDevframe(d, {
          base,
          // The host app owns the SPA in bridge mode — never mount the
          // definition's own client assets here.
          distDir: false,
          flags: options.flags,
          host: options.host,
          // Pinned port → explicit side-car. Otherwise share Vite's own
          // HTTP server; a middleware-mode Vite (no httpServer) has no
          // upgrade to share, so ask for an auto-port side-car instead.
          ...(options.port != null
            ? { ws: { port: options.port } }
            : server.httpServer
              // `initDevframe`'s `server` option shares a real
              // `node:http` server's WS upgrade listener — Vite's dev
              // server is always one in practice (never the HTTP/2
              // variant `ViteDevServer['httpServer']` also allows for).
              ? { server: server.httpServer as NodeHttpServer }
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

export interface DevframeViteOptions extends DevframeViteBridgeOptions {
  /**
   * Start devframe's RPC/WS bridge ({@link devframeViteBridge}) instead of
   * statically mounting the built SPA ({@link devframeVitePlugin}).
   *
   * @default false (static mount, no server)
   */
  bridge?: boolean
}

/**
 * Convenience wrapper around {@link devframeVitePlugin} /
 * {@link devframeViteBridge}, picked via `options.bridge`. Reach for the
 * two underlying plugins directly when a devframe needs both mounted at
 * once (e.g. a bridge for RPC alongside a static mount serving its own
 * bundled UI).
 */
export function devframeVite(d: DevframeDefinition, options: DevframeViteOptions = {}): DevframeVitePlugin {
  const { bridge, ...rest } = options
  return bridge ? devframeViteBridge(d, rest) : devframeVitePlugin(d, { base: rest.base })
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
