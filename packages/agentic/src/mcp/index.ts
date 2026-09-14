// The devframe MCP adapter implementation: translates the agent-host surface
// of a DevframeDefinition into an MCP server. Users import it through
// `devframe/adapters/mcp` (which lazy-loads this entry); this subpath exists
// for devframe's loaders, not for direct consumption.
//
// The MCP SDK behind it is a regular dependency of `@devframes/agentic`, an
// optional peer of `devframe`; first-party adapters load this entry lazily
// (`importRuntimeModule`) so neither enters a consumer bundle graph. The
// exported signatures are typed against devframe's own `types/mcp.ts`
// contract - no SDK type leaks, so the SDK stays swappable.

export { createMcpServer } from './build-server'
export { createMcpFetchHandler } from './fetch'
export { mountMcpHttp } from './http'

export type { MountedMcpHttp, MountMcpHttpOptions } from 'devframe/internal'
export type {
  CreateMcpFetchHandlerOptions,
  CreateMcpServerOptions,
  McpConnectionInfo,
  McpFetchHandler,
  McpServerHandle,
} from 'devframe/types'
