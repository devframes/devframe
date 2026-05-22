import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { clear } from './functions/clear.ts'
import { demoPrompts } from './functions/demo-prompts.ts'
import { send } from './functions/send.ts'

export const serverFunctions = [demoPrompts, send, clear] as const

declare module 'devframe' {
  interface DevToolsRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
