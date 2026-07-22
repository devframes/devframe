import type { DevframeConnectionStatus, DevframeRpcClient, DevframeRpcClientOptions } from 'devframe/client'
import { connectDevframe } from 'devframe/client'

export type { DevframeConnectionStatus, DevframeRpcClient }
export type { AgentManifest, DevframeInspectCommandInfo, InvokeResult, RpcFunctionAgentInfo, RpcFunctionInfo } from '../types'

/**
 * Connect to the inspector's devframe backend. A thin, typed wrapper
 * around devframe's {@link connectDevframe}; the SPA derives its base
 * from `document.baseURI`, so no options are required in the common case.
 */
export function connectInspect(options?: DevframeRpcClientOptions): Promise<DevframeRpcClient> {
  return connectDevframe(options)
}
