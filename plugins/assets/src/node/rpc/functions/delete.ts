import fsp from 'node:fs/promises'
import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getAssetsContext } from '../../context'
import { assertAssetMutationPath } from '../../paths'

/** One request covers both single- and multi-select delete. */
export const deleteAssets = defineRpcFunction({
  name: 'devframes:plugin:assets:delete',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({ paths: s.array(s.string()) })],
  returns: s.object({ deleted: s.array(s.string()) }),
  agent: {
    title: 'Delete assets',
    description: 'Delete one or more assets from the managed directory.',
    safety: 'destructive',
    tags: ['assets'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      /** See `list.ts` for why the async handler is cast. */
      handler: (async ({ paths }: { paths: string[] }): Promise<{ deleted: string[] }> => {
        const deleted: string[] = []
        for (const path of paths) {
          // Reject any pre-existing symlink component right before unlinking.
          const absolute = await assertAssetMutationPath(assets.dir, path)
          try {
            await fsp.unlink(absolute)
            deleted.push(path)
          }
          catch (error) {
            // A stale listing pointing at an already-removed file is not
            // exceptional for a bulk delete, so skip it and keep going.
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
              throw error
          }
        }
        return { deleted }
      }) as any,
    }
  },
})
