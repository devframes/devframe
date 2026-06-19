import type { RpcDefinitionsToFunctionsWithNamespace } from 'devframe/rpc'
import { getCwd } from './functions/get-cwd.ts'
import { listFiles } from './functions/list-files.ts'

export const NAMESPACE = 'devframe-files-inspector'

export const serverFunctions = [getCwd, listFiles] as const

declare module 'devframe' {
  // Functions are defined with bare names and registered through a scoped
  // context, so the registry keys are namespaced to match the runtime ids.
  interface DevframeRpcServerFunctions
    extends RpcDefinitionsToFunctionsWithNamespace<typeof NAMESPACE, typeof serverFunctions> {}
}
