import type { ConnectionMeta, DevframeHost, DevframeNodeContext, DevframeStorageScope } from 'devframe/types'
import { DEVFRAME_CONNECTION_META_FILENAME } from 'devframe/constants'
import { serveStaticHandler } from 'devframe/utils/serve-static'
import { H3 } from 'h3'

export interface CreateDevframeNextHostOptions {
  /**
   * Public origin the Next app is reachable at, e.g. `http://localhost:3000`.
   * Surfaced through {@link DevframeHost.resolveOrigin} for docks that need an
   * absolute iframe URL.
   */
  resolveOrigin: () => string
  /**
   * Resolve a directory the host owns for persisted devframe state, per
   * {@link DevframeHost.getStorageDir}.
   */
  getStorageDir: (scope: DevframeStorageScope) => string
  /**
   * Initial connection meta served at every base registered via
   * {@link DevframeHost.mountConnectionMeta}. Usually unknown until the
   * side-car RPC/WS server has started — publish it later with
   * {@link DevframeNextHost.setConnectionMeta}.
   */
  connectionMeta?: ConnectionMeta
}

export interface DevframeNextHostMcpOptions {
  /** Name reported in the MCP handshake. Default: `'devframe (next)'`. */
  serverName?: string
  /** Version reported in the MCP handshake. Default: `'0.0.0'`. */
  serverVersion?: string
  /** Expose shared-state keys as MCP resources / `read_state`. Default: `true`. */
  exposeSharedState?: boolean | ((key: string) => boolean)
  /**
   * Origin allow-list beyond the loopback default. `false` disables the
   * origin gate entirely.
   */
  allowedOrigins?: readonly string[] | false
}

export interface DevframeNextHost {
  /**
   * The {@link DevframeHost} to hand to `createHubContext` / `createHostContext`.
   * Its `mountStatic` / `mountConnectionMeta` calls accumulate into the
   * {@link DevframeNextHost.fetch} handler below.
   */
  host: DevframeHost
  /**
   * A WHATWG-`fetch` handler that serves every mounted SPA (with SPA
   * fallback, correct content types, and path-traversal guarding — all from
   * devframe's own `serveStaticHandler`) and answers `<base>/__connection.json`
   * for each base registered via `mountConnectionMeta`. Delegate a Next App
   * Router route handler straight to it:
   *
   * ```ts
   * export async function GET(request: Request) {
   *   return (await ensureHub()).fetch(request)
   * }
   * ```
   */
  fetch: (request: Request) => Promise<Response>
  /**
   * Publish the live connection meta once the RPC/WS server is up. Until this
   * is called (and without an initial `connectionMeta`), meta requests answer
   * `503` so a racing client retries rather than caching a wrong endpoint.
   */
  setConnectionMeta: (meta: ConnectionMeta) => void
  /**
   * Serve an MCP Streamable-HTTP endpoint at `path` **in-process** — on the
   * Next app's own origin, through the same catch-all route as the SPAs (the
   * `/_next/mcp` shape). Built on `createMcpFetchHandler` from
   * `devframe/adapters/mcp` (imported lazily: `@modelcontextprotocol/sdk`
   * stays an optional peer). Advertise the path in the connection meta
   * (`mcp: { path }` — same origin, no port) and register the instance via
   * `registerDevframeInstance` so `devframe connect` can discover it.
   *
   * @experimental
   */
  mountMcp: (
    ctx: DevframeNodeContext,
    path: string,
    options?: DevframeNextHostMcpOptions,
  ) => Promise<{ dispose: () => Promise<void> }>
}

const META_SUFFIX = `/${DEVFRAME_CONNECTION_META_FILENAME}`

/** Drop trailing slashes from a mount base (`/__git/` → `/__git`). */
function stripTrailingSlash(base: string): string {
  return base.replace(/\/+$/, '')
}

/**
 * Build a Node-runtime {@link DevframeHost} for a Next.js App Router app that
 * hosts one or more devframes, plus the single `fetch` handler its catch-all
 * route delegates to.
 *
 * This is the hosted-adapter counterpart to `viteDevBridge` for the Next
 * runtime, which — being webpack/Turbopack rather than Vite — can't reuse the
 * Vite middleware path. Instead of hand-rolling static serving in a route
 * handler, static mounts are registered on an internal h3 app and served
 * through devframe's shared `serveStaticHandler` (`app.fetch` makes h3 a
 * WHATWG-`fetch` handler, exactly what an App Router route returns).
 *
 * Pins Node runtime (`export const runtime = 'nodejs'` in the route) because
 * the static handler streams from the filesystem.
 */
export function createDevframeNextHost(
  options: CreateDevframeNextHostOptions,
): DevframeNextHost {
  const app = new H3()
  const metaBases = new Set<string>()
  const mcpMounts = new Map<string, { fetch: (request: Request) => Promise<Response> }>()
  let connectionMeta = options.connectionMeta

  const host: DevframeHost = {
    mountStatic(base, distDir) {
      // h3's sub-app mount matches on segment boundaries and strips `base`
      // from the path, so the static handler sees paths relative to `distDir`
      // — the same longest-prefix behavior the hand-rolled registry did.
      const staticApp = new H3()
      staticApp.use(serveStaticHandler(distDir))
      app.mount(stripTrailingSlash(base), staticApp)
    },
    mountConnectionMeta(base) {
      metaBases.add(stripTrailingSlash(base))
    },
    resolveOrigin: options.resolveOrigin,
    getStorageDir: options.getStorageDir,
  }

  async function fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)

    // MCP endpoints answer before the static handler for the same reason as
    // the connection meta below: SPA fallback must not swallow them.
    const mcp = mcpMounts.get(stripTrailingSlash(pathname))
    if (mcp)
      return mcp.fetch(request)

    // Answer `<base>/__connection.json` before the static handler runs — a
    // mounted SPA's SPA-fallback would otherwise resolve the miss to
    // `index.html` and swallow the discovery request.
    if (pathname.endsWith(META_SUFFIX)
      && metaBases.has(pathname.slice(0, -META_SUFFIX.length))) {
      if (!connectionMeta)
        return new Response(null, { status: 503 })
      return Response.json(connectionMeta)
    }

    const response = await app.fetch(request)
    // Normalize a miss to a bare 404. An unmounted path falls through to h3's
    // default handler, which returns a JSON error body; for an asset host a
    // body-less 404 is cleaner and matches a plain static server.
    if (response.status === 404)
      return new Response(null, { status: 404 })
    return response
  }

  return {
    host,
    fetch,
    setConnectionMeta(meta) {
      connectionMeta = meta
    },
    async mountMcp(ctx, path, mcpOptions = {}) {
      const { createMcpFetchHandler } = await import('devframe/adapters/mcp')
      const handler = createMcpFetchHandler(ctx, {
        serverName: mcpOptions.serverName ?? 'devframe (next)',
        serverVersion: mcpOptions.serverVersion ?? '0.0.0',
        exposeSharedState: mcpOptions.exposeSharedState ?? true,
        allowedOrigins: mcpOptions.allowedOrigins,
      })
      const key = stripTrailingSlash(path)
      mcpMounts.set(key, handler)
      return {
        dispose: async () => {
          mcpMounts.delete(key)
          await handler.dispose()
        },
      }
    },
  }
}
