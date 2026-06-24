import { onScopeDispose, ref, shallowRef } from 'vue'

const refreshFn = shallowRef<(() => Promise<void>) | null>(null)
const loading = ref(false)

/**
 * Register the active view's refresh handler. The header refresh button
 * calls whichever handler is currently registered; views clear it on
 * unmount.
 */
export function useRefreshProvider(fn: () => Promise<void>): void {
  refreshFn.value = fn
  onScopeDispose(() => {
    if (refreshFn.value === fn)
      refreshFn.value = null
  })
}

export function useRefresh() {
  async function refresh(): Promise<void> {
    if (!refreshFn.value || loading.value)
      return
    loading.value = true
    try {
      await refreshFn.value()
    }
    finally {
      loading.value = false
    }
  }

  return { refresh, loading }
}
