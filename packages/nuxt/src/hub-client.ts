import type { DevframeClientRuntime, DevframeClientRuntimeOptions } from '@devframes/hub/client'
import type { Ref } from 'vue'
import { createDevframeClientRuntime } from '@devframes/hub/client'
import { DEVFRAMES_HUB_BASE } from '@devframes/hub/constants'
import { onScopeDispose, shallowRef } from 'vue'

export type { DevframeClientHost, DevframeClientHostOptions, DevframeClientRuntime, DevframeClientRuntimeOptions } from '@devframes/hub/client'

export interface UseDevframeHubClientOptions extends DevframeClientRuntimeOptions {
  /**
   * Hub mount base to connect to. Forwarded as `connect.baseURL` when no
   * `rpc` / `connect.baseURL` is supplied.
   *
   * @default '/__devframes/'
   */
  base?: string
}

/**
 * Boot the devframes-hub **client runtime** inside a Nuxt (Vue) client
 * component: the browser half of `@devframes/nuxt/hub`. Connects RPC to the
 * hub (defaulting `base` to `/__devframes/`), assembles the shared
 * `DevframeClientContext`, imports each dock's client script into the page,
 * and disposes when the current effect scope is torn down. Returns a ref that
 * resolves to the {@link DevframeClientRuntime} (`null` while connecting).
 *
 * Client-only: call it inside `<script setup>` on a client-rendered component
 * (e.g. under `<ClientOnly>`), never during SSR. Only needed when you render
 * your own dock UI (or override the hub's `ui`); with the default
 * `@devframes/hub-ui` the injected `embedded.js` boots the client for you.
 */
export function useDevframeHubClient(
  options: UseDevframeHubClientOptions = {},
): Ref<DevframeClientRuntime | null> {
  const { base = DEVFRAMES_HUB_BASE, connect, ...rest } = options
  const host = shallowRef<DevframeClientRuntime | null>(null)
  let disposed = false

  void createDevframeClientRuntime({
    ...rest,
    ...(rest.rpc ? {} : { connect: { baseURL: base, ...connect } }),
  }).then((created) => {
    if (disposed) {
      created.dispose()
      return
    }
    host.value = created
  })

  onScopeDispose(() => {
    disposed = true
    host.value?.dispose()
    host.value = null
  })

  return host
}
