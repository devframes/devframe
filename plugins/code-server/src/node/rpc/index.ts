import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import type { CodeServerSharedState } from '../types'
import { detect } from './functions/detect'
import { start } from './functions/start'
import { status } from './functions/status'
import { stop } from './functions/stop'

export const serverFunctions = [
  detect,
  status,
  start,
  stop,
] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}

  interface DevframeRpcSharedStates {
    'devframes:plugin:code-server:state': CodeServerSharedState
  }
}
