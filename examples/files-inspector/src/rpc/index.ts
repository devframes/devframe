import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { getCwd } from './functions/get-cwd'
import { listFiles } from './functions/list-files'

export const serverFunctions = [getCwd, listFiles] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
