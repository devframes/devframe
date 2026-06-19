import type { RpcDefinitionsToFunctionsWithNamespace } from 'devframe/rpc'
import type { NAMESPACE } from '../constants.ts'
import { clear } from './functions/clear.ts'
import { demoPrompts } from './functions/demo-prompts.ts'
import { send } from './functions/send.ts'

export const serverFunctions = [demoPrompts, send, clear] as const

declare module 'devframe' {
  // Bare-named definitions registered through a scoped context; the
  // registry keys are namespaced to match the runtime ids.
  interface DevframeRpcServerFunctions
    extends RpcDefinitionsToFunctionsWithNamespace<typeof NAMESPACE, typeof serverFunctions> {}
}
