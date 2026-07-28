import type { DevframeRpcClient } from 'devframe/client'
import type { AssetsCapabilities } from '../../../rpc/functions/capabilities'
import type { AssetInfo } from '../../../types'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { connectAssets } from '../../../client'

const CHANGED_EVENT = 'devframes:plugin:assets:changed'

export interface UseAssetsResult {
  assets: AssetInfo[] | null
  capabilities: AssetsCapabilities | null
  loading: boolean
  error: string | null
  isStatic: boolean
  refresh: () => Promise<void>
  rpc: DevframeRpcClient | null
}

/**
 * Connects to the assets devframe, fetches the listing + write
 * capabilities, and keeps both live: `devframes:plugin:assets:changed`
 * broadcasts (from the server's file watcher) trigger a refetch.
 */
export function useAssets(): UseAssetsResult {
  const rpcRef = useRef<DevframeRpcClient | null>(null)
  const [, forceRender] = useState(0)
  const [assets, setAssets] = useState<AssetInfo[] | null>(null)
  const [capabilities, setCapabilities] = useState<AssetsCapabilities | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isStatic, setIsStatic] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const rpc = rpcRef.current
    if (!rpc)
      return
    try {
      const [list, caps] = await Promise.all([
        rpc.call('devframes:plugin:assets:list'),
        rpc.call('devframes:plugin:assets:capabilities'),
      ])
      setAssets(list)
      setCapabilities(caps)
      setError(null)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rpc = await connectAssets()
      if (cancelled)
        return
      rpcRef.current = rpc
      setIsStatic(rpc.connectionMeta.backend === 'static')
      forceRender(n => n + 1)
      await rpc.ensureTrusted()

      // Another consumer sharing this rpc client may have registered the
      // handler already — chain onto it instead of replacing it, mirroring
      // the messages plugin's client-side event wiring.
      const existing = rpc.client.definitions.get(CHANGED_EVENT)
      if (existing) {
        const prev = existing.handler
        existing.handler = (...args: unknown[]) => {
          void refresh()
          return prev?.(...args)
        }
      }
      else {
        rpc.client.register({
          name: CHANGED_EVENT,
          type: 'action',
          handler: () => {
            void refresh()
          },
        })
      }

      await refresh()
      rpc.events.on('rpc:is-trusted:updated', (trusted) => {
        if (trusted)
          void refresh()
      })
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  return { assets, capabilities, loading, error, isStatic, refresh, rpc: rpcRef.current }
}
