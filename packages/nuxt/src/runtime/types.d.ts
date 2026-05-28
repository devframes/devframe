import type { DevframeRpcClient } from 'devframe/client'

declare module '#app' {
  interface NuxtApp {
    /**
     * Devframe RPC client, provided by the `@devframes/nuxt` module's
     * client plugin.
     */
    $rpc: DevframeRpcClient
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    /** Devframe RPC client (see `NuxtApp['$rpc']`). */
    $rpc: DevframeRpcClient
  }
}

export {}
