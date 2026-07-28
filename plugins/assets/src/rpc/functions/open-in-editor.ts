import type { DevframeNodeContext } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { launchEditor } from 'devframe/utils/launch-editor'
import * as v from 'valibot'
import { getAssetsContext } from '../../node/context'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

/**
 * Reuses devframe's `launchEditor` utility (the same one backing the core
 * `devframe:open-in-editor` recipe) but resolves the path against the
 * managed directory first, so the client only ever sends a root-relative
 * path — never the server's absolute filesystem layout.
 */
export const openInEditor = defineAssetsRpc({
  name: 'devframes:plugin:assets:open-in-editor',
  type: 'action',
  jsonSerializable: true,
  args: [v.string()],
  returns: v.void(),
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
        launchEditor(assets.resolvePath(path))
      }) as any,
    }
  },
})
