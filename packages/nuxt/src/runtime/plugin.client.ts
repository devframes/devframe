import { connectDevframe } from 'devframe/client'
import { defineNuxtPlugin, useRuntimeConfig } from '#imports'

/**
 * Nuxt client plugin that calls `connectDevframe()` once on the client
 * and provides the RPC client as `$rpc` / `useNuxtApp().$rpc`.
 */
export default defineNuxtPlugin({
  async setup() {
    const baseURL = useRuntimeConfig().public.devframe.baseURL ?? './'
    const rpc = await connectDevframe({ baseURL })
    return {
      provide: {
        rpc: rpc as import('devframe/client').DevframeRpcClient,
      },
    }
  },
})
