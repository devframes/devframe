import type { DevframeRpcClientOptions } from 'devframe/client'
import { connectDevframe } from 'devframe/client'

export type { AssetImageMeta, AssetInfo, AssetType, CodeSnippet } from '../types'

export function connectAssets(options?: DevframeRpcClientOptions) {
  return connectDevframe(options)
}
