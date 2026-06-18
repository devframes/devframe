import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { branches } from './functions/branches.ts'
import { diff } from './functions/diff.ts'
import { log } from './functions/log.ts'
import { status } from './functions/status.ts'

export const serverFunctions = [status, log, branches, diff] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
