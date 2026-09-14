// The user-facing MCP adapter entry. The implementation (and the MCP SDK)
// lives in the optional `@devframes/agentic` peer, which is never imported
// directly: each function lazy-loads it on first call (throwing a coded
// DF0079 when the peer is not installed), so importing this entry stays
// side-effect-free and loads no MCP code. Signatures are typed against
// devframe's own contract in `types/mcp.ts`; `createMcpFetchHandler` and
// `mountMcpHttp` are async here (they await the lazy load), unlike the
// synchronous implementations behind them.
import type { H3 } from 'h3'
import type { MountedMcpHttp, MountMcpHttpOptions } from '../node/agentic'
import type { DevframeNodeContext } from '../types/context'
import type { DevframeDefinition } from '../types/devframe'
import type { CreateMcpFetchHandlerOptions, CreateMcpServerOptions, McpFetchHandler, McpServerHandle } from '../types/mcp'
import { importAgenticMcp } from '../node/agentic'

export type { MountedMcpHttp, MountMcpHttpOptions } from '../node/agentic'
export type {
  CreateMcpFetchHandlerOptions,
  CreateMcpServerOptions,
  McpConnectionInfo,
  McpFetchHandler,
  McpServerHandle,
} from '../types/mcp'

/** Build an MCP server over the agent surface of a devframe definition (stdio). */
export async function createMcpServer(
  definition: DevframeDefinition,
  options?: CreateMcpServerOptions,
): Promise<McpServerHandle> {
  const mcp = await importAgenticMcp()
  return mcp.createMcpServer(definition, options)
}

/** Build a framework-agnostic `Request → Response` MCP endpoint over a devframe context. */
export async function createMcpFetchHandler(
  ctx: DevframeNodeContext,
  options: CreateMcpFetchHandlerOptions,
): Promise<McpFetchHandler> {
  const mcp = await importAgenticMcp()
  return mcp.createMcpFetchHandler(ctx, options)
}

/** Mount a stateless MCP endpoint on an h3 app at `path`. */
export async function mountMcpHttp(
  app: H3,
  ctx: DevframeNodeContext,
  path: string,
  options: MountMcpHttpOptions,
): Promise<MountedMcpHttp> {
  const mcp = await importAgenticMcp()
  return mcp.mountMcpHttp(app, ctx, path, options)
}
