import type { DevframeRpcClient, DevframeRpcClientOptions } from 'devframe/client'
import { connectDevframe } from 'devframe/client'

export type { DevframeRpcClient }
export type { Impact, ScanReport, Violation, ViolationNode } from '../shared/protocol.ts'

/**
 * Connect to the a11y inspector's devframe backend. A thin, typed wrapper
 * around devframe's {@link connectDevframe}; the panel derives its base from
 * `document.baseURI`, so no options are required in the common case. The
 * live scan/highlight loop itself rides a same-origin BroadcastChannel,
 * independent of this connection.
 */
export function connectA11y(options?: DevframeRpcClientOptions): Promise<DevframeRpcClient> {
  return connectDevframe(options)
}
