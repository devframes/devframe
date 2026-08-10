import type { DevframeNodeContext } from 'devframe'
import fsp from 'node:fs/promises'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { s } from 'devframe/utils/simple-schema'
import { diagnostics } from '../../diagnostics'
import { getAssetsContext } from '../../node/context'

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
      // See `list.ts` for why the async handler is cast.
      handler: (async ({ path }: { path: string }): Promise<void> => {
        const absolute = assets.resolvePath(path)
        const stat = await fsp.stat(absolute).catch(() => undefined)
        if (stat && !stat.isDirectory())
          throw diagnostics.DP_ASSETS_0005({ path })
        await fsp.mkdir(absolute, { recursive: true })
      }) as any,
    }
  },
})
