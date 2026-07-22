import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { describeAgent } from './functions/describe-agent'
import { executeCommand } from './functions/execute-command'
import { invoke } from './functions/invoke'
import { invokeAgentTool } from './functions/invoke-agent-tool'
import { listCommands } from './functions/list-commands'
import { listFunctions } from './functions/list-functions'
import { listStateKeys } from './functions/list-state-keys'
import { readAgentResource } from './functions/read-agent-resource'

/**
 * The introspection RPC functions registered by the inspector plugin.
 * Namespaced `devframes:plugin:inspect:*` per the plugin convention.
 */
export const serverFunctions = [
  listFunctions,
  invoke,
  listStateKeys,
  describeAgent,
  invokeAgentTool,
  readAgentResource,
  listCommands,
  executeCommand,
] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
