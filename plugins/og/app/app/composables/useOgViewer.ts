import type { DevframeRpcClient } from 'devframe/client'
import type { OgSnapshot } from '../connect'
import { connectDevframe } from 'devframe/client'
import { computed, readonly, shallowRef } from 'vue'
import { formatAddress, resolveAddress } from '../utils/address'
import { useHostPage } from './useHostPage'

export function useOgViewer() {
  const rpc = shallowRef<DevframeRpcClient | null>(null)
  const snapshot = shallowRef<OgSnapshot | null>(null)
  const loading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const isStatic = computed(() => rpc.value?.connectionMeta.backend === 'static')
  let latestRequest = 0

  const host = useHostPage()
  const target = shallowRef(host
    ? formatAddress(host.href(), host.origin)
    : new URLSearchParams(location.search).get('url') ?? '')

  async function inspect(next = target.value): Promise<void> {
    if (isStatic.value && snapshot.value)
      return
    target.value = next.trim()
    const request = ++latestRequest
    loading.value = true
    error.value = null
    try {
      rpc.value ??= await connectDevframe()
      await rpc.value.ensureTrusted()
      const result = await rpc.value.call('devframes:plugin:og:resolve-metadata', {
        url: resolveAddress(target.value, host?.origin),
      })
      // A page navigation can start a newer request before this one returns.
      if (request !== latestRequest)
        return
      snapshot.value = result
      if ((!target.value || isStatic.value) && result.requestedUrl)
        target.value = formatAddress(result.requestedUrl, host?.origin)

      const url = new URL(location.href)
      if (target.value)
        url.searchParams.set('url', target.value)
      else
        url.searchParams.delete('url')
      history.replaceState(null, '', url)
    }
    catch (cause) {
      if (request === latestRequest) {
        // Drop the last result, so the panel does not show it as the current page.
        snapshot.value = null
        error.value = cause instanceof Error ? cause.message : String(cause)
      }
    }
    finally {
      if (request === latestRequest)
        loading.value = false
    }
  }

  host?.onNavigate((href) => {
    // Follow the page only while the address is a page path, not a typed remote URL.
    const address = formatAddress(href, host.origin)
    if (!isStatic.value && target.value.startsWith('/') && address !== target.value)
      void inspect(address)
  })

  /** Read the current page path again, for a router the browser cannot report. */
  function refresh(): Promise<void> {
    return inspect(host ? formatAddress(host.href(), host.origin) : target.value)
  }

  return {
    error: readonly(error),
    inspect,
    isEmbedded: host !== null,
    isStatic,
    loading: readonly(loading),
    refresh,
    snapshot: readonly(snapshot),
    target,
  }
}
