import type { DevframeNodeContext } from 'devframe/types'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { isAllowedOrigin } from 'devframe/utils/origin'
import { bridgeListChanged, buildMcpServerFromContext } from './build-server'

export interface CreateMcpFetchHandlerOptions {
  /** Name reported in the MCP handshake. */
  serverName: string
  /** Version reported in the MCP handshake. */
  serverVersion: string
  /** Expose shared-state keys as MCP resources; see `buildMcpServerFromContext`. */
  exposeSharedState: boolean | ((key: string) => boolean)
  /**
   * Origin allow-list beyond the loopback default. `false` disables the
   * origin gate entirely. Default: loopback-only.
   *
   * Unlike the WS transport, the MCP route does **not** allow `Origin`-less
   * requests: a route-based endpoint is reachable by any local process, so a
   * request must carry an `Origin` that passes the gate. Native clients
   * (e.g. `devframe connect`) send their loopback origin explicitly.
   */
  allowedOrigins?: readonly string[] | false
}

export interface McpFetchHandler {
  /**
   * WHATWG-`fetch` handler for the MCP endpoint. Hand every method
   * (POST/GET/DELETE) on the endpoint's path to it; routing by path is the
   * host's job.
   */
  fetch: (request: Request) => Promise<Response>
  /** Tear down the handler (aborts in-flight exchanges, drops the change bridge). */
  dispose: () => Promise<void>
}

/**
 * Build a framework-agnostic MCP endpoint over a devframe context: a
 * web-standard `Request → Response` handler any host can mount: h3 (see
 * `mountMcpHttp`), a Next.js App Router route, or any other fetch-shaped
 * server.
 *
 * The endpoint is **stateless**: it serves the 2026-07-28 revision per request
 * through the SDK's {@link createMcpHandler}, which builds a fresh MCP server
 * (from the shared, live `ctx` via `buildMcpServerFromContext`) for each
 * request: no `Mcp-Session-Id` registry, no session-local routing, no
 * GET/DELETE teardown protocol. 2025-era clients are still served through the
 * SDK's default stateless legacy path. `list_changed` events reach modern
 * `subscriptions/listen` streams through the handler's `notify` bus.
 *
 * The origin gate guards every request: loopback-default DNS-rebinding
 * protection that (unlike the WS upgrade's `isAllowedOrigin`) also rejects
 * `Origin`-less requests, so a route-based endpoint isn't reachable by an
 * arbitrary local process.
 */
export function createMcpFetchHandler(
  ctx: DevframeNodeContext,
  options: CreateMcpFetchHandlerOptions,
): McpFetchHandler {
  const allowedOrigins = options.allowedOrigins

  const handler = createMcpHandler(() => buildMcpServerFromContext(ctx, {
    serverName: options.serverName,
    serverVersion: options.serverVersion,
    exposeSharedState: options.exposeSharedState,
  }))

  // A single, long-lived bridge from devframe's change events onto the
  // handler's `subscriptions/listen` bus, published once for the endpoint,
  // not per (ephemeral, per-request) server instance.
  const unbridge = bridgeListChanged(ctx, {
    tools: () => { handler.notify.toolsChanged() },
    resources: () => { handler.notify.resourcesChanged() },
  })

  async function handle(req: Request): Promise<Response> {
    // Origin gate: the endpoint's DNS-rebinding protection and its guard
    // against arbitrary local processes. Unlike the WS transport, an
    // `Origin`-less request is rejected: a route-based MCP endpoint would
    // otherwise be reachable by any local process. A request must carry an
    // `Origin` that is loopback or on the configured allow-list.
    const origin = req.headers.get('origin') ?? undefined
    if (allowedOrigins !== false && (origin === undefined || !isAllowedOrigin(origin, allowedOrigins ?? [])))
      return new Response('Forbidden: origin required', { status: 403 })

    return handler.fetch(req)
  }

  return {
    fetch: handle,
    dispose: async () => {
      unbridge()
      await handler.close()
    },
  }
}
