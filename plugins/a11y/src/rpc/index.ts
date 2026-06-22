import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { getConfig } from './functions/get-config.ts'

export const serverFunctions = [getConfig] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
