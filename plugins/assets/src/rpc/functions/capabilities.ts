import type { DevframeNodeContext } from 'devframe/types'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import * as v from 'valibot'
import { getAssetsContext } from '../../node/context'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

export interface AssetsCapabilities {
  write: boolean
  uploadExtensions: readonly string[] | '*'
}

/**
 * Lets the UI know upfront whether upload / rename / delete / mkdir are
 * available, so it can hide or disable those affordances proactively
 * instead of letting the user hit a "method not found" error — the same
 * `canWrite`-gating idea the git plugin's `GitStatus.canWrite` follows.
 */
export const capabilities = defineAssetsRpc({
  name: 'devframes:plugin:assets:capabilities',
  type: 'query',
  snapshot: true,
  jsonSerializable: true,
  args: [],
  returns: v.object({
    write: v.boolean(),
    uploadExtensions: v.union([v.array(v.string()), v.literal('*')]),
  }),
  agent: {
    title: 'Read assets capabilities',
    description: 'Read whether upload, rename, delete, and folder creation are enabled, and which upload extensions are allowed.',
    safety: 'read',
    tags: ['assets'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      handler: (async (): Promise<AssetsCapabilities> => ({
        write: assets.write,
        uploadExtensions: assets.uploadExtensions,
      })) as any,
    }
  },
})
