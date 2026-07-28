import type { DevframeNodeContext } from 'devframe/types'
import type { AssetInfo } from '../../types'
import fsp from 'node:fs/promises'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import * as v from 'valibot'
import { getAssetsContext } from '../../node/context'
import { statToAssetInfo } from '../../node/scanner'
import { assetInfoSchema } from './list'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Overwrites a text asset's content in place. Uploads (new files, binary
 * content) go through the streaming `upload` action instead — this one is
 * for the details panel's inline text editor, where the whole edited body
 * is already in memory as a string.
 */
export const writeText = defineAssetsRpc({
  name: 'devframes:plugin:assets:write-text',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({ path: v.string(), content: v.string() })],
  returns: assetInfoSchema,
  agent: {
    title: 'Overwrite a text asset',
    description: 'Overwrite the content of an existing text-type asset.',
    safety: 'destructive',
    tags: ['assets', 'text'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      // See `list.ts` for why the async handler is cast.
      handler: (async ({ path, content }: { path: string, content: string }): Promise<AssetInfo> => {
        const absolute = assets.resolvePath(path)
        await fsp.writeFile(absolute, content, 'utf-8')
        return statToAssetInfo(assets.dir, assets.rawBase, path, await fsp.lstat(absolute))
      }) as any,
    }
  },
})
