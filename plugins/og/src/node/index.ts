import type { DevframeNodeContext } from 'devframe/types'
import type { ResolveMetadataOptions } from '../rpc/functions/resolve-metadata'
import { createResolveMetadataRpc, resolveMetadata } from '../rpc/functions/resolve-metadata'

export function setupOg(ctx: DevframeNodeContext, options: ResolveMetadataOptions = {}): void {
  const hasOptions = options.defaultUrl !== undefined || options.fetch !== undefined
  ctx.rpc.register(hasOptions ? createResolveMetadataRpc(options) : resolveMetadata)
}

export { fetchOgMetadata, parseOgMetadata } from './metadata'
