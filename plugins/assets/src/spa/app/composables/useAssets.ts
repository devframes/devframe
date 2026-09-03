import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
import type { Ref } from 'vue'
import type { AssetsCapabilities } from '../../../rpc/functions/capabilities'
import type { AssetInfo } from '../../../types'
import { shallowRef } from 'vue'
import { connectAssets } from '../../../client'

const CHANGED_EVENT = 'devframes:plugin:assets:changed'

export interface UseAssetsResult {
  rpc: Ref<DevframeRpcClient | null>
  assets: Ref<AssetInfo[] | null>
  capabilities: Ref<AssetsCapabilities | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  isStatic: Ref<boolean>
  status: Ref<DevframeConnectionStatus>
  /** Establish the connection + wire live-refresh. Call once from `onMounted`. */
  connect: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Connects to the assets devframe, fetches the listing + write
 * capabilities, and keeps both live: `devframes:plugin:assets:changed`
 * broadcasts (from the server's file watcher) trigger a refetch.
 */
export function useAssets(): UseAssetsResult {
  const rpc = shallowRef<DevframeRpcClient | null>(null)
  const assets = shallowRef<AssetInfo[] | null>(null)
  const capabilities = shallowRef<AssetsCapabilities | null>(null)
  const loading = shallowRef(true)
  const error = shallowRef<string | null>(null)
  const isStatic = shallowRef(false)
  const status = shallowRef<DevframeConnectionStatus>('connecting')

  async function refresh(): Promise<void> {
    const client = rpc.value
    if (!client)
      return
    try {
      const [list, caps] = await Promise.all([
        client.call('devframes:plugin:assets:list'),
        client.call('devframes:plugin:assets:capabilities'),
      ])
      assets.value = list
      capabilities.value = caps
      error.value = null
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
    finally {
      loading.value = false
    }
  }

  async function connect(): Promise<void> {
    const client = await connectAssets()
    rpc.value = client
    isStatic.value = client.connectionMeta.backend === 'static'
    status.value = client.status
    client.events.on('connection:status', () => {
      status.value = client.status
    })
    await client.ensureTrusted()

    // Another consumer sharing this rpc client may have registered the
    // handler already, so chain onto it instead of replacing it, mirroring
    // the messages plugin's client-side event wiring.
    const existing = client.client.definitions.get(CHANGED_EVENT)
    if (existing) {
      const prev = existing.handler
      existing.handler = (...args: unknown[]) => {
        void refresh()
        return prev?.(...args)
      }
    }
    else {
      client.client.register({
        name: CHANGED_EVENT,
        type: 'action',
        handler: () => {
          void refresh()
        },
      })
    }

    await refresh()
    client.events.on('rpc:is-trusted:updated', (trusted) => {
      if (trusted)
        void refresh()
    })
  }

  return { rpc, assets, capabilities, loading, error, isStatic, status, connect, refresh }
}
