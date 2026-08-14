import type { DevframeClientHost, DevframeClientHostOptions } from '@devframes/hub/client'
import type { Ref } from 'vue'
import { createDevframeClientHost } from '@devframes/hub/client'
import { onScopeDispose, shallowRef } from 'vue'

export type { DevframeClientHost, DevframeClientHostOptions } from '@devframes/hub/client'

/** Default hub mount base — mirrors `@devframes/hub`'s `DEVFRAMES_HUB_BASE`. */
const DEVFRAMES_HUB_BASE = '/__devframes/'

export interface UseDevframeHubClientOptions extends DevframeClientHostOptions {
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
 * component — the browser half of `@devframes/nuxt/hub`. Connects RPC to the
 * hub (defaulting `base` to `/__devframes/`), assembles the shared
 * `DevframeClientContext`, imports each dock's client script into the page,
 * and disposes when the current effect scope is torn down. Returns a ref that
 * resolves to the {@link DevframeClientHost} (`null` while connecting).
 *
 * Client-only: call it inside `<script setup>` on a client-rendered component
 * (e.g. under `<ClientOnly>`), never during SSR. Only needed when you render
 * your own dock UI (or override the hub's `ui`); with the default
 * `@devframes/hub-ui` the injected `embedded.js` boots the client for you.
 */
export function useDevframeHubClient(
  options: UseDevframeHubClientOptions = {},
): Ref<DevframeClientHost | null> {
  const { base = DEVFRAMES_HUB_BASE, connect, ...rest } = options
  const host = shallowRef<DevframeClientHost | null>(null)
  let disposed = false

  void createDevframeClientHost({
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
