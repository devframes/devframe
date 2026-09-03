import type { DevframeConnectionStatus, DevframeRpcClient, DevframeRpcClientOptions } from 'devframe/client'
import type { ConnectionMeta } from 'devframe/types'
import { connectDevframe } from 'devframe/client'

export { STATE_KEY } from '../src/node/constants'
export type { ConnectionMeta, DevframeConnectionStatus, DevframeRpcClient }
export type {
  CodeServerConnect,
  CodeServerDetection,
  CodeServerServerInfo,
  CodeServerSharedState,
  CodeServerStatusResult,
} from '../src/node/types'

/**
 * Connect to the code-server plugin's devframe backend. A thin, typed wrapper
 * around devframe's {@link connectDevframe}; the SPA derives its base from
 * `document.baseURI`, so no options are required in the common case.
 */
export function connectCodeServer(options?: DevframeRpcClientOptions): Promise<DevframeRpcClient> {
  return connectDevframe(options)
}
