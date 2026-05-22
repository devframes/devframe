import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { getCwd } from './functions/get-cwd.ts'
import { listFiles } from './functions/list-files.ts'

export const serverFunctions = [getCwd, listFiles] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
