import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { clear } from './functions/clear'
import { demoPrompts } from './functions/demo-prompts'
import { send } from './functions/send'

export const serverFunctions = [demoPrompts, send, clear] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
