import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { env } from './functions/env.ts'
import { memory } from './functions/memory.ts'
import { system } from './functions/system.ts'

export const serverFunctions = [system, memory, env] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
