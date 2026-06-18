import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { describeAgent } from './functions/describe-agent'
import { invoke } from './functions/invoke'
import { listFunctions } from './functions/list-functions'
import { listStateKeys } from './functions/list-state-keys'

/**
 * The introspection RPC functions registered by the inspector plugin.
 * Namespaced `devframes-plugin-inspect:*` per the plugin convention.
 */
export const serverFunctions = [
  listFunctions,
  invoke,
  listStateKeys,
  describeAgent,
] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
