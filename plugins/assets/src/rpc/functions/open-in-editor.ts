import type { DevframeNodeContext } from 'devframe'
import { OPEN_SERVICE_PACKAGE } from '@devframes/service-open'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { s } from 'devframe/utils/simple-schema'
import { diagnostics } from '../../diagnostics'
import { getAssetsContext } from '../../node/context'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Delegates to the `@devframes/service-open` wire service (installed by the
 * plugin's setup with the managed dir as an allowed root), resolving the
 * path against the managed directory first — so the client only ever sends
 * a root-relative path, never the server's absolute filesystem layout.
 */
export const openInEditor = defineAssetsRpc({
  name: 'devframes:plugin:assets:open-in-editor',
  type: 'action',
  jsonSerializable: true,
  args: [s.string()],
  returns: s.void(),
  agent: {
    title: 'Open an asset in the editor',
    description: 'Open an asset in the user\'s configured editor.',
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
        await open.openInEditor({ path: assets.resolvePath(path) })
      }) as any,
    }
  },
})
