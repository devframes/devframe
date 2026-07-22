import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { resolveMetadata } from './functions/resolve-metadata'

export const serverFunctions = [resolveMetadata] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}

export { createResolveMetadataRpc, resolveMetadata } from './functions/resolve-metadata'
export type { ResolveMetadataOptions } from './functions/resolve-metadata'
