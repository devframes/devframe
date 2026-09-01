import type { ConnectionMeta } from '../types/context'
import type { DevframeDefinition, DevframeDeploymentKind, McpAuthorization, McpRouteOptions } from '../types/devframe'
import process from 'node:process'
import { getPort } from 'get-port-please'
import { cleanDoubleSlashes, withLeadingSlash, withoutLeadingSlash, withTrailingSlash } from 'ufo'
import { DEVFRAME_MCP_ROUTE } from '../constants'
import { diagnostics } from '../node/diagnostics'

const DEFAULT_PORT = 9999

/**
 * Resolve the mount base path for a devframe's SPA. Hosted adapters
 * (`vite`, `embedded`) default to `/__<id>/` so they don't collide
 * with the host app; standalone adapters (`cli`, `build`)
 * default to `/` because they own the origin.
 *
 * The devframe author can override with `basePath` on the definition.
 */
export function resolveBasePath(def: DevframeDefinition, kind: DevframeDeploymentKind): string {
  if (def.basePath)
    return normalizeBasePath(def.basePath)
  return kind === 'standalone' ? '/' : `/__${def.id}/`
}

export function normalizeBasePath(base: string): string {
  return cleanDoubleSlashes(withTrailingSlash(withLeadingSlash(base)))
}

export interface ResolveDevServerPortOptions {
  /** Bind host (passed to `get-port-please` for in-use detection). */
  host?: string
  /** Override the preferred port. Default: `def.cli?.port ?? 9999`. */
  defaultPort?: number
}

/**
 * Resolve the listening port for `createDevServer` (and `createHandler`'s
 * side-car tiers), honoring the definition's `cli.port` / `cli.portRange` /
 * `cli.random` settings. Exposed separately so authors who run their own
 * argv parsing can resolve a port up-front (to print it, log it, etc.)
 * before starting the server.
 */
export async function resolveDevServerPort(
  def: DevframeDefinition,
  options: ResolveDevServerPortOptions = {},
): Promise<number> {
  const host = options.host ?? def.cli?.host ?? 'localhost'
  const port = options.defaultPort ?? def.cli?.port ?? DEFAULT_PORT
  // Only include optional fields when set — `get-port-please` spreads
  // user options over its defaults, so `portRange: undefined` would
  // wipe out the internal `[]` and crash on iteration.
  const portOptions: Parameters<typeof getPort>[0] = { port, host }
  if (def.cli?.portRange)
    portOptions.portRange = def.cli.portRange
  if (def.cli?.random)
    portOptions.random = def.cli.random
  return getPort(portOptions)
}

/**
 * A fully-resolved MCP route configuration: the concrete authorization policy
 * (never the `mcp: true` shorthand), plus the optional route path and origin
 * allow-list. Every route mount consumes this shape.
 */
export interface ResolvedMcpConfig {
  /** Route segment, relative to the base. Default resolved by the caller. */
  path?: string
  /** Origin allow-list, or `false` to disable the origin gate. */
  allowedOrigins?: readonly string[] | false
  /** The resolved identity policy — a bearer token, callback, or `false`. */
  authorization: McpAuthorization
}

/**
 * Normalize the `cli.mcp` / `mcp` option (`boolean | McpRouteOptions`) into a
 * fully-resolved config, or `undefined` when the MCP route is disabled.
 *
 * The route grants access to privileged agent tools, so an enabled route
 * always resolves to a concrete authorization policy. `mcp: true` is shorthand
 * for the bearer read from `DEVFRAME_MCP_AUTH_TOKEN`; an object config must
 * carry an explicit `authorization`. A missing/empty token or absent
 * `authorization` throws {@link diagnostics.DF0077} so the route is never
 * mounted unauthenticated.
 */
export function resolveMcpConfig(mcp: boolean | McpRouteOptions | undefined): ResolvedMcpConfig | undefined {
  if (!mcp)
    return undefined
  if (mcp === true) {
    const token = process.env.DEVFRAME_MCP_AUTH_TOKEN
    if (!token)
      throw diagnostics.DF0077()
    return { authorization: token }
  }
  const { authorization } = mcp
  if (authorization === undefined || (typeof authorization === 'string' && authorization.length === 0))
    throw diagnostics.DF0077()
  return {
    ...(mcp.path !== undefined ? { path: mcp.path } : {}),
    ...(mcp.allowedOrigins !== undefined ? { allowedOrigins: mcp.allowedOrigins } : {}),
    authorization,
  }
}

/**
 * Resolve the `mcp` entry a `__connection.json` should advertise for a dev
 * server started with the given `mcp` option (falling back to `def.cli?.mcp`,
 * exactly like `createDevServer`), or `undefined` when the route is
 * disabled.
 *
 * Hosted bridges that hand-roll their connection meta pass the side-car
 * `port`: the advertised path becomes absolute (the side-car mounts at `/`)
 * and the client dials `<page-host>:<port><path>`. Without `port` the path
 * stays relative, resolved against `__connection.json`'s own location (the
 * same-server default).
 */
export function resolveMcpConnectionMeta(
  def: DevframeDefinition,
  mcp: boolean | McpRouteOptions | undefined,
  port?: number,
): ConnectionMeta['mcp'] {
  const config = resolveMcpConfig(mcp ?? def.cli?.mcp)
  if (!config)
    return undefined
  const route = withoutLeadingSlash(config.path ?? DEVFRAME_MCP_ROUTE)
  return port != null
    ? { path: withLeadingSlash(route), port }
    : { path: route }
}
