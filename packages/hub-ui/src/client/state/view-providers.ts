import type { DevframeRpcClient } from '@devframes/hub/client'
import type { DevframeViewProviders } from '@devframes/hub/types'
import type { Ref } from 'vue'
import { VIEW_PROVIDERS_STATE_KEY } from '@devframes/hub/constants'
import { shallowRef } from 'vue'

// The hub publishes `dock view type → { base }` as read-only shared state; the
// UI reads it to resolve a provider iframe URL and to detect "no provider".
// Cached per rpc so every provider-backed dock shares one subscription.
const byRpc = new WeakMap<DevframeRpcClient, Ref<DevframeViewProviders>>()

export function useViewProviders(rpc: DevframeRpcClient): Ref<DevframeViewProviders> {
  const existing = byRpc.get(rpc)
  if (existing)
    return existing

  const providers = shallowRef<DevframeViewProviders>({})
  byRpc.set(rpc, providers)
  void rpc.sharedState
    .get<DevframeViewProviders>(VIEW_PROVIDERS_STATE_KEY, { initialValue: {} })
    .then((state) => {
      providers.value = state.value()
      state.on('updated', () => {
        providers.value = state.value()
      })
    })
  return providers
}
