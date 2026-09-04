import fsp from 'node:fs/promises'
import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getAssetsContext } from '../../context'
import { diagnostics } from '../../diagnostics'
import { assertAssetMutationPath } from '../../paths'

export const mkdir = defineRpcFunction({
  name: 'devframes:plugin:assets:mkdir',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({ path: s.string() })],
  returns: s.void(),
  agent: {
    title: 'Create a folder',
    description: 'Create a folder under the managed directory, including any missing parent folders.',
    safety: 'action',
    tags: ['assets'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      /** See `list.ts` for why the async handler is cast. */
      handler: (async ({ path }: { path: string }): Promise<void> => {
        const absolute = await assertAssetMutationPath(assets.dir, path)
        const stat = await fsp.stat(absolute).catch(() => undefined)
        if (stat && !stat.isDirectory())
          throw diagnostics.DP_ASSETS_0005({ path })
        await fsp.mkdir(absolute, { recursive: true })
        // Re-check after creation: reject any symlink component that
        // materialized under the root before anything follows this path.
        await assertAssetMutationPath(assets.dir, path)
      }) as any,
    }
  },
})
