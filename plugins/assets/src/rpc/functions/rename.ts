import type { DevframeNodeContext } from 'devframe/types'
import type { AssetInfo } from '../../types'
import fsp from 'node:fs/promises'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { dirname, extname } from 'pathe'
import * as v from 'valibot'
import { diagnostics } from '../../diagnostics'
import { getAssetsContext } from '../../node/context'
import { statToAssetInfo } from '../../node/scanner'
import { assetInfoSchema } from './list'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

export interface RenameArgs {
  /** Root-relative path of the asset to rename. */
  path: string
  /**
   * New base name, without an extension — the original extension is
   * always preserved (mirrors Nuxt DevTools' rename dialog exactly). Any
   * extension included here is treated as part of the base name, not
   * stripped.
   */
  newName: string
}

export const rename = defineAssetsRpc({
  name: 'devframes:plugin:assets:rename',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({ path: v.string(), newName: v.string() })],
  returns: assetInfoSchema,
  agent: {
    title: 'Rename an asset',
    description: 'Rename an asset, keeping it in the same folder.',
    safety: 'destructive',
    tags: ['assets'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      // See `list.ts` for why the async handler is cast.
      handler: (async ({ path, newName }: RenameArgs): Promise<AssetInfo> => {
        const trimmed = newName.trim()
        if (!trimmed || /[/\\]/.test(trimmed))
          throw diagnostics.DP_ASSETS_0006({ name: newName })

        const folder = dirname(path)
        const nextName = `${trimmed}${extname(path)}`
        const nextRelPath = folder === '.' ? nextName : `${folder}/${nextName}`
        const from = assets.resolvePath(path)
        const to = assets.resolvePath(nextRelPath)

        if (from === to) {
          const stat = await fsp.lstat(from)
          return statToAssetInfo(assets.dir, assets.baseURL, path, stat)
        }

        const targetExists = await fsp.access(to).then(() => true).catch(() => false)
        if (targetExists)
          throw diagnostics.DP_ASSETS_0003({ path: nextRelPath })

        await fsp.mkdir(dirname(to), { recursive: true })
        try {
          await fsp.rename(from, to)
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            throw diagnostics.DP_ASSETS_0004({ path })
          throw error
        }

        const stat = await fsp.lstat(to)
        return statToAssetInfo(assets.dir, assets.baseURL, nextRelPath, stat)
      }) as any,
    }
  },
})
