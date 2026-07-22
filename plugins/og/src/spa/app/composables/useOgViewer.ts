import type { DevframeRpcClient } from 'devframe/client'
import type { OgSnapshot } from '../../../types'
import { computed, readonly, shallowRef } from 'vue'
import { connectOg } from '../../../client'

export function useOgViewer() {
  const rpc = shallowRef<DevframeRpcClient | null>(null)
  const params = new URLSearchParams(location.search)
  const target = shallowRef(params.get('url') ?? '')
  const snapshot = shallowRef<OgSnapshot | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const isStatic = computed(() => rpc.value?.connectionMeta.backend === 'static')

  async function inspect(next = target.value): Promise<void> {
    if (isStatic.value && snapshot.value)
      return
    target.value = next.trim()
    loading.value = true
    error.value = null
    try {
      rpc.value ??= await connectOg()
      await rpc.value.ensureTrusted()
      const result = await rpc.value.call('devframes:plugin:og:resolve-metadata', { url: target.value })
      snapshot.value = result
      if ((!target.value || isStatic.value) && result.requestedUrl)
        target.value = result.requestedUrl

      const url = new URL(location.href)
      if (target.value)
        url.searchParams.set('url', target.value)
      else
        url.searchParams.delete('url')
      history.replaceState(null, '', url)
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
    finally {
      loading.value = false
    }
  }

  return {
    error: readonly(error),
    inspect,
    isStatic,
    loading: readonly(loading),
    snapshot: readonly(snapshot),
    target,
  }
}
