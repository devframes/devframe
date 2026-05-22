import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { getCwd } from './get-cwd'
import { listFiles } from './list-files'

export const serverFunctions = [getCwd, listFiles] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
