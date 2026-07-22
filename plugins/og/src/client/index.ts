import type { DevframeRpcClientOptions } from 'devframe/client'
import { connectDevframe } from 'devframe/client'

export type { OgHeadTag, OgHeadTagName, OgResolveInput, OgSnapshot } from '../types'
export type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'

export function connectOg(options?: DevframeRpcClientOptions) {
  return connectDevframe(options)
}
