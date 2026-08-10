import type { DevframeNodeContext } from 'devframe'
import fsp from 'node:fs/promises'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { s } from 'devframe/utils/simple-schema'
import { getAssetsContext } from '../../node/context'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

const DEFAULT_LIMIT = 5000

export const readText = defineAssetsRpc({
  name: 'devframes:plugin:assets:read-text',
  type: 'query',
  jsonSerializable: true,
  args: [s.string(), s.optional(s.number())],
  returns: s.nullable(s.string()),
  agent: {
    title: 'Read a text asset',
    description: 'Read the (possibly truncated) text content of a text-type asset, for preview or editing.',
    safety: 'read',
    tags: ['assets', 'text'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      // See `list.ts` for why the async handler is cast.
      handler: (async (path: string, limit: number = DEFAULT_LIMIT): Promise<string | null> => {
        try {
          const content = await fsp.readFile(assets.resolvePath(path), 'utf-8')
          return content.slice(0, limit)
        }
        catch {
          return null
        }
      }) as any,
    }
  },
})
