import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { clear } from './clear'
import { demoPrompts } from './demo-prompts'
import { send } from './send'

export const serverFunctions = [demoPrompts, send, clear] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
