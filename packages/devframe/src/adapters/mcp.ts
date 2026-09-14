// The user-facing MCP adapter entry: a re-export of the implementation in
// the optional `@devframes/agentic` peer (which also carries the MCP SDK).
// Like `devframe/adapters/cac` with its optional `cac` peer, importing it
// without the peer throws module-not-found. First-party adapters lazy-load
// the peer through `node/agentic.ts` (DF0078/DF0079) instead.
export type { MountedMcpHttp, MountMcpHttpOptions } from '../node/agentic'
export type {
  CreateMcpFetchHandlerOptions,
  CreateMcpServerOptions,
  McpConnectionInfo,
  McpFetchHandler,
  McpServerHandle,
} from '../types/mcp'
export { createMcpFetchHandler, createMcpServer, mountMcpHttp } from '@devframes/agentic/mcp'
