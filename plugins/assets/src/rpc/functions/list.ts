import type { DevframeNodeContext } from 'devframe/types'
import type { AssetInfo } from '../../types'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import * as v from 'valibot'
import { getAssetsContext } from '../../node/context'
import { scanAssets } from '../../node/scanner'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

export const assetInfoSchema = v.object({
  path: v.string(),
  type: v.picklist(['image', 'font', 'video', 'audio', 'text', 'other']),
  publicPath: v.string(),
  size: v.number(),
  mtime: v.number(),
})

export const list = defineAssetsRpc({
  name: 'devframes:plugin:assets:list',
  type: 'query',
  snapshot: true,
  jsonSerializable: true,
  args: [],
  returns: v.array(assetInfoSchema),
  agent: {
    title: 'List managed assets',
    description: 'List every file under the managed directory with its type, size, and last-modified time.',
    safety: 'read',
    tags: ['assets', 'files'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      // The RPC runtime awaits handlers before validating `returns`; its
      // public setup type currently models schema-backed returns as
      // synchronous.
      handler: (async (): Promise<AssetInfo[]> => scanAssets(assets.dir, assets.rawBase)) as any,
    }
  },
})
