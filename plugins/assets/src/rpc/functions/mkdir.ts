import type { DevframeNodeContext } from 'devframe'
import fsp from 'node:fs/promises'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { s } from 'devframe/utils/simple-schema'
import { diagnostics } from '../../diagnostics'
import { getAssetsContext } from '../../node/context'
import { assertAssetMutationPath } from '../../node/paths'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

export const mkdir = defineAssetsRpc({
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
