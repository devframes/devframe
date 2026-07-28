import type { DevframeNodeContext } from 'devframe/types'
import type { AssetImageMeta } from '../../types'
import fsp from 'node:fs/promises'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { imageMeta } from 'image-meta'
import * as v from 'valibot'
import { getAssetsContext } from '../../node/context'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

export const readImageMeta = defineAssetsRpc({
  name: 'devframes:plugin:assets:read-image-meta',
  type: 'query',
  jsonSerializable: true,
  args: [v.string()],
  returns: v.nullable(v.object({
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    orientation: v.optional(v.number()),
  })),
  agent: {
    title: 'Read image dimensions',
    description: 'Read width, height, and orientation for an image asset.',
    safety: 'read',
    tags: ['assets', 'images'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      // See `list.ts` for why the async handler is cast.
      handler: (async (path: string): Promise<AssetImageMeta | null> => {
        try {
          const buffer = await fsp.readFile(assets.resolvePath(path))
          const meta = imageMeta(buffer)
          return { width: meta.width, height: meta.height, orientation: meta.orientation }
        }
        catch {
          return null
        }
      }) as any,
    }
  },
})
