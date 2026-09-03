import type { DevframeNodeContext } from 'devframe'
import type { AssetInfo } from '../../types'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { s } from 'devframe/utils/simple-schema'
import { getAssetsContext } from '../../context'
import { scanAssets } from '../../scanner'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

export const assetInfoSchema = s.object({
  path: s.string(),
  type: s.picklist(['image', 'font', 'video', 'audio', 'text', 'other']),
  publicPath: s.string(),
  size: s.number(),
  mtime: s.number(),
  fsPath: s.optional(s.string()),
})

export const list = defineAssetsRpc({
  name: 'devframes:plugin:assets:list',
  type: 'query',
  snapshot: true,
  jsonSerializable: true,
  args: [],
  returns: s.array(assetInfoSchema),
  agent: {
    title: 'List managed assets',
    description: 'List every file under the managed directory with its type, size, and last-modified time.',
    safety: 'read',
    tags: ['assets', 'files'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      /**
       * The RPC runtime awaits handlers before validating `returns`; its
       * public setup type currently models schema-backed returns as
       * synchronous.
       * `fsPath` is dev-only, never baked into a static build's dump.
       */
      handler: (async (): Promise<AssetInfo[]> => scanAssets(assets.dir, assets.baseURL, ctx.mode === 'dev')) as any,
    }
  },
})
