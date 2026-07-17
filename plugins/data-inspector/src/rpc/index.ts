import type { RpcDefinitionsToFunctions } from 'devframe/rpc'
import { query } from './functions/query'
import { queryPath } from './functions/query-path'
import { savedDelete, savedList, savedSave } from './functions/saved'
import { skeleton } from './functions/skeleton'
import { sources } from './functions/sources'
import { suggest } from './functions/suggest'

/**
 * The RPC functions registered by the data-inspector plugin.
 * Namespaced `devframes:plugin:data-inspector:*` (the plugin id).
 */
export const serverFunctions = [
  sources,
  query,
  queryPath,
  skeleton,
  suggest,
  savedList,
  savedSave,
  savedDelete,
] as const

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends RpcDefinitionsToFunctions<typeof serverFunctions> {}
}
