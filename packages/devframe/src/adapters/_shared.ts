import type { ConnectionMeta } from '../types/context'
import type { DevframeDefinition, DevframeDeploymentKind, McpRouteOptions } from '../types/devframe'
import { getPort } from 'get-port-please'
import { cleanDoubleSlashes, withLeadingSlash, withoutLeadingSlash, withTrailingSlash } from 'ufo'
import { DEVFRAME_MCP_ROUTE } from '../constants'

const DEFAULT_PORT = 9999

/**
 * Resolve the mount base path for a devframe's SPA. Hosted adapters
 * (`vite`, `embedded`) default to `/__<id>/` so they don't collide
 * with the host app; standalone adapters (`cli`, `spa`, `build`)
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
 * Normalize the `cli.mcp` / `mcp` option (`boolean | McpRouteOptions`) into
 * concrete options, or `undefined` when the MCP route is disabled.
 */
export function resolveMcpConfig(mcp: boolean | McpRouteOptions | undefined): McpRouteOptions | undefined {
  if (!mcp)
    return undefined
  return mcp === true ? {} : mcp
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
 *
 * @experimental
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
