import type { DevframeRpcClientOptions } from 'devframe/client'
import { connectDevframe } from 'devframe/client'

export type { OgHeadTag, OgSnapshot } from '../../src/node/types'

export function connectOg(options?: DevframeRpcClientOptions) {
  return connectDevframe(options)
}
