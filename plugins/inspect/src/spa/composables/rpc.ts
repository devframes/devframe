import type { DevframeRpcClient } from '@devframes/plugin-inspect/client'
import { connectInspect } from '@devframes/plugin-inspect/client'
import { reactive, shallowRef } from 'vue'

export const connection = reactive<{
  connected: boolean
  error: string | null
  backend: 'websocket' | 'static' | null
}>({
  connected: false,
  error: null,
  backend: null,
})

const rpcRef = shallowRef<DevframeRpcClient | null>(null)

export async function connect(): Promise<void> {
  try {
    const client = await connectInspect()
    rpcRef.value = client
    connection.backend = client.connectionMeta.backend
    // Best-effort trust handshake — data calls succeed regardless on the
    // single-user standalone server, but shared-state subscription needs
    // it, so kick it off and ignore failures/timeouts.
    if (client.connectionMeta.backend === 'websocket')
      client.ensureTrusted(5000).catch(() => {})
    connection.connected = true
  }
  catch (e) {
    connection.error = (e as Error)?.message ?? String(e)
  }
}

export function useRpc() {
  return rpcRef
}

export function isStatic(): boolean {
  return connection.backend === 'static'
}
