import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import type { A11yRuntimeConfig } from './functions/get-config.ts'
import { createGetConfig, getConfig } from './functions/get-config.ts'

/** Default function set — drives the RPC type augmentation below. */
export const serverFunctions = [getConfig] as const

/** Build the function set configured with author options. */
export function buildServerFunctions(options: A11yRuntimeConfig = {}) {
  return [createGetConfig(options)] as const
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
