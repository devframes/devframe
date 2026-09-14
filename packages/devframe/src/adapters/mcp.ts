// The user-facing MCP adapter entry. The implementation (and the MCP SDK)
// lives in the optional `@devframes/agentic` peer, which is never imported
// directly: this entry lazy-loads it (throwing a coded DF0079 when the peer
// is not installed) and re-exports the surface, typed against devframe's own
// contract in `types/mcp.ts`.
import { importAgenticMcp } from '../node/agentic'

export type { MountedMcpHttp, MountMcpHttpOptions } from '../node/agentic'
export type {
  CreateMcpFetchHandlerOptions,
  CreateMcpServerOptions,
  McpConnectionInfo,
  McpFetchHandler,
  McpServerHandle,
} from '../types/mcp'

// The alias must resolve its exports at module evaluation (they are consumed
// as plain named imports), so the lazy load is a deliberate top-level await;
// it builds in its own graph (see tsdown.config.ts) to keep TLA contained.
// eslint-disable-next-line antfu/no-top-level-await
const mcp = await importAgenticMcp()

export const createMcpServer = mcp.createMcpServer
export const createMcpFetchHandler = mcp.createMcpFetchHandler
export const mountMcpHttp = mcp.mountMcpHttp
