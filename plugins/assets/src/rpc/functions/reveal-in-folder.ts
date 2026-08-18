import type { DevframeNodeContext } from 'devframe'
import { OPEN_SERVICE_PACKAGE } from '@devframes/service-open'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { s } from 'devframe/utils/simple-schema'
import { dirname } from 'pathe'
import { diagnostics } from '../../diagnostics'
import { getAssetsContext } from '../../node/context'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Delegates to the `@devframes/service-open` wire service's `openInFinder`,
 * opening the asset's containing folder so it's revealed in the OS file
 * manager rather than launched with its default app (which `download`
 * already covers).
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
        const open = ctx.services.get(OPEN_SERVICE_PACKAGE)
        if (!open)
          throw diagnostics.DP_ASSETS_0008()
        await open.openInFinder({ path: dirname(assets.resolvePath(path)) })
      }) as any,
    }
  },
})
