import type { DevframeNodeContext } from 'devframe'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { open } from 'devframe/utils/open'
import { s } from 'devframe/utils/simple-schema'
import { dirname } from 'pathe'
import { getAssetsContext } from '../../node/context'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Reuses devframe's `open` utility (the same one backing the core
 * `devframe:open-in-finder` recipe), opening the asset's containing folder
 * so it's revealed in the OS file manager rather than launched with its
 * default app (which `download` already covers).
 */
export const revealInFolder = defineAssetsRpc({
  name: 'devframes:plugin:assets:reveal-in-folder',
  type: 'action',
  jsonSerializable: true,
  args: [s.string()],
  returns: s.void(),
  agent: {
    title: 'Reveal an asset in the file manager',
    description: 'Open the OS file manager at the asset\'s containing folder.',
    safety: 'action',
    tags: ['assets'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      // See `list.ts` for why the async handler is cast.
      handler: (async (path: string): Promise<void> => {
        await open(dirname(assets.resolvePath(path)))
      }) as any,
    }
  },
})
