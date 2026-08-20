import type { RpcDefinitionsToFunctionsWithNamespace } from 'devframe/rpc'
import { getInfo } from './functions/get-info.ts'
import { listItems } from './functions/list-items.ts'

export const NAMESPACE = 'devframe-starter'

export const serverFunctions = [getInfo, listItems] as const

declare module 'devframe' {
  // Functions are defined with bare names and registered through a scoped
  // context, so the registry keys are namespaced to match the runtime ids
  // (`devframe-starter:get-info`, `devframe-starter:list-items`).
  interface DevframeRpcServerFunctions
    extends RpcDefinitionsToFunctionsWithNamespace<typeof NAMESPACE, typeof serverFunctions> {}
}
