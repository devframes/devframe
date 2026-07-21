import type { DevframeConnectionStatus, DevframeRpcClient, DevframeRpcClientOptions } from 'devframe/client'
import { connectDevframe } from 'devframe/client'

export { STATE_KEY } from '../constants'
export type { DevframeConnectionStatus, DevframeRpcClient }
export type {
  CodeServerBackend,
  CodeServerConnect,
  CodeServerDetection,
  CodeServerLogin,
  CodeServerMode,
  CodeServerServerInfo,
  CodeServerSharedState,
  CodeServerStartResult,
  CodeServerStatus,
  CodeServerStatusResult,
} from '../types'

/**
 * Connect to the code-server plugin's devframe backend. A thin, typed wrapper
 * around devframe's {@link connectDevframe}; the SPA derives its base from
 * `document.baseURI`, so no options are required in the common case.
 */
export function connectCodeServer(options?: DevframeRpcClientOptions): Promise<DevframeRpcClient> {
  return connectDevframe(options)
}
