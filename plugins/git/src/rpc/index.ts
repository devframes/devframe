import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { branches } from './functions/branches.ts'
import { commit } from './functions/commit.ts'
import { diff } from './functions/diff.ts'
import { log } from './functions/log.ts'
import { show } from './functions/show.ts'
import { stage } from './functions/stage.ts'
import { status } from './functions/status.ts'
import { unstage } from './functions/unstage.ts'

/** Read-only RPC — always registered. */
export const readFunctions = [status, log, show, branches, diff] as const

/** Mutating RPC — registered only when write actions are enabled. */
export const writeFunctions = [stage, unstage, commit] as const

export const serverFunctions = [status, log, show, branches, diff, stage, unstage, commit] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
