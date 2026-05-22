import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { env } from './env'
import { memory } from './memory'
import { system } from './system'

export const serverFunctions = [system, memory, env] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
