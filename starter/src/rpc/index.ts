import type { RpcDefinitionsToFunctionsWithNamespace } from 'devframe/rpc'
import { getState } from './functions/get-state.ts'

export const NAMESPACE = 'devframe-starter'

export const serverFunctions = [getState] as const

declare module 'devframe' {
  // Functions are defined with bare names and registered through a scoped
  // context, so the registry key is namespaced to match the runtime id
  // (`devframe-starter:get-state`).
  interface DevframeRpcServerFunctions
    extends RpcDefinitionsToFunctionsWithNamespace<typeof NAMESPACE, typeof serverFunctions> {}
}
