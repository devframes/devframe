import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { env } from './functions/env'
import { memory } from './functions/memory'
import { system } from './functions/system'

export const serverFunctions = [system, memory, env] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
