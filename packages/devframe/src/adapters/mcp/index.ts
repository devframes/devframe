// Public entry for the devframe MCP adapter. Translates the agent-host
// surface of a DevframeDefinition into an MCP server.
//
// Usage:
//   import { createMcpServer } from 'devframe/adapters/mcp'
//   await createMcpServer(definition, { transport: 'stdio' })
//
// The MCP SDK behind it is a regular dependency of `devframe`; first-party
// adapters still load this entry lazily (`importRuntimeModule`) so the SDK
// stays out of consumer bundle graphs.

export {
  createMcpServer,
  type CreateMcpServerOptions,
  type McpServerHandle,
} from './build-server'

export {
  createMcpFetchHandler,
  type CreateMcpFetchHandlerOptions,
  type McpFetchHandler,
} from './fetch'

export {
  type MountedMcpHttp,
  mountMcpHttp,
  type MountMcpHttpOptions,
} from './http'
