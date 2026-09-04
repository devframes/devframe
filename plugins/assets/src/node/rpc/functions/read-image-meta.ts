import type { AssetImageMeta } from '../../types'
import fsp from 'node:fs/promises'
import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { imageMeta } from 'image-meta'
import { getAssetsContext } from '../../context'
import { resolveAssetReadPath } from '../../paths'

export const readImageMeta = defineRpcFunction({
  name: 'devframes:plugin:assets:read-image-meta',
  type: 'query',
  jsonSerializable: true,
  args: [s.string()],
  returns: s.nullable(s.object({
    width: s.optional(s.number()),
    height: s.optional(s.number()),
    orientation: s.optional(s.number()),
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
      /** See `list.ts` for why the async handler is cast. */
      handler: (async (path: string): Promise<AssetImageMeta | null> => {
        try {
          const buffer = await fsp.readFile(await resolveAssetReadPath(assets.dir, path))
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
