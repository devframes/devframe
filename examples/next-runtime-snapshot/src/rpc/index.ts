import type { RpcDefinitionsToFunctionsWithNamespace } from 'devframe/rpc'
import { env } from './functions/env.ts'
import { memory } from './functions/memory.ts'
import { system } from './functions/system.ts'

export const NAMESPACE = 'next-runtime-snapshot'

export const serverFunctions = [system, memory, env] as const

declare module 'devframe' {
  // Bare-named definitions registered through a scoped context; the
  // registry keys are namespaced to match the runtime ids.
  interface DevframeRpcServerFunctions
    extends RpcDefinitionsToFunctionsWithNamespace<typeof NAMESPACE, typeof serverFunctions> {}
}
