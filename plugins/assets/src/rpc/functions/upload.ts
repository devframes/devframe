import type { DevframeNodeContext } from 'devframe'
import { createWriteStream } from 'node:fs'
import fsp from 'node:fs/promises'
import { createDefineWrapperWithContext } from 'devframe/rpc'
import { s } from 'devframe/utils/simple-schema'
import { dirname, extname } from 'pathe'
import { diagnostics } from '../../diagnostics'
import { getAssetsContext } from '../../node/context'
import { assertAssetMutationPath } from '../../node/paths'

const defineAssetsRpc = createDefineWrapperWithContext<DevframeNodeContext>()

/** Streaming channel name, namespaced like every other RPC name in this plugin. */
export const UPLOAD_CHANNEL = 'devframes:plugin:assets:upload'

function isExtensionAllowed(path: string, allowed: readonly string[] | '*'): boolean {
  if (allowed === '*')
    return true
  const ext = extname(path).slice(1).toLowerCase()
  return allowed.includes(ext)
}

/**
 * Allocates an upload and returns a streaming id. Actual bytes flow over
 * the `upload` channel opened in `setupAssets` — see the client-side
 * `useUpload` hook for the matching `rpc.streaming.upload()` call.
 */
export const upload = defineAssetsRpc({
  name: 'devframes:plugin:assets:upload',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({ path: s.string() })],
  returns: s.object({ uploadId: s.string() }),
  agent: {
    title: 'Upload an asset',
    description: 'Allocate an upload slot for a new file at the given path. The caller streams the bytes over the paired upload channel.',
    safety: 'action',
    tags: ['assets'],
  },
  setup: (ctx) => {
    const assets = getAssetsContext(ctx)
    return {
      // See `list.ts` for why the async handler is cast.
      handler: (async ({ path }: { path: string }): Promise<{ uploadId: string }> => {
        if (!isExtensionAllowed(path, assets.uploadExtensions)) {
          throw diagnostics.DP_ASSETS_0002({
            path,
            extension: extname(path).slice(1).toLowerCase() || '(none)',
            allowed: assets.uploadExtensions === '*' ? [] : assets.uploadExtensions,
          })
        }

        const absolute = await assertAssetMutationPath(assets.dir, path)
        await fsp.mkdir(dirname(absolute), { recursive: true })
        // Re-check after the parent dirs are created and reject any
        // pre-existing symlink component before we open the write stream.
        await assertAssetMutationPath(assets.dir, path)

        const channel = assets.uploadChannel
        if (!channel)
          throw diagnostics.DP_ASSETS_0007()

        const reader = channel.openInbound()
        void (async () => {
          const file = createWriteStream(absolute)
          try {
            for await (const chunk of reader)
              file.write(chunk)
          }
          catch {
            // Client disconnected or cancelled mid-upload — drop the
            // partial file rather than leave a corrupt asset behind.
            file.close()
            await fsp.unlink(absolute).catch(() => {})
            return
          }
          file.close()
        })()

        return { uploadId: reader.id }
      }) as any,
    }
  },
})
