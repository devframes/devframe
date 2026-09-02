// Types-only: loads the service's RPC/scope augmentations so the scoped
// `call('highlight', …)` below is fully typed.
import type {} from '@devframes/service-shiki'
import type { DevframeRpcClient } from 'devframe/client'

const SHIKI_SERVICE = '@devframes/service-shiki'

/**
 * Server-highlight a text asset through the `@devframes/service-shiki` wire
 * service, when the host advertises it. Resolves `null` when the service is
 * absent or highlighting fails - the preview then falls back to a plain
 * `<pre>`. The language is inferred from the file extension; unknown ones
 * degrade to plain text server-side.
 */
export async function highlightAsset(rpc: DevframeRpcClient, path: string, code: string): Promise<string | null> {
  const shiki = rpc.services.get(SHIKI_SERVICE)
  if (!shiki)
    return null
  const lang = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase()
  try {
    const { html } = await shiki.rpc.call('highlight', { code, lang })
    return html
  }
  catch {
    return null
  }
}
