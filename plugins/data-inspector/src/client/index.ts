import type { DevframeConnectionStatus, DevframeRpcClient, DevframeRpcClientOptions } from 'devframe/client'
import { connectDevframe } from 'devframe/client'

export type { DevframeConnectionStatus, DevframeRpcClient }
export type {
  DataSourceMeta,
  FilterOptions,
  Query,
  QueryOutcome,
  QueryStats,
  SavedQuery,
  SavedQueryScope,
  SaveQueryInput,
  SkeletonOutcome,
  SuggestItem,
  SuggestOutcome,
} from '../engine/contract'

/**
 * Connect to the data inspector's devframe backend. A thin, typed wrapper
 * around devframe's {@link connectDevframe}; the SPA derives its base from
 * `document.baseURI`, so no options are required in the common case.
 */
export function connectDataInspector(options?: DevframeRpcClientOptions): Promise<DevframeRpcClient> {
  return connectDevframe(options)
}
