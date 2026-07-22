import type { DevframeConnectionStatus, DevframeRpcClient } from '@devframes/plugin-code-server/client'
import { connectCodeServer } from '@devframes/plugin-code-server/client'
import { reactive, shallowRef } from 'vue'

export const connection = reactive<{
  connected: boolean
  status: DevframeConnectionStatus
  error: string | null
  backend: 'websocket' | 'static' | null
}>({
  connected: false,
  status: 'connecting',
  error: null,
  backend: null,
})

const rpcRef = shallowRef<DevframeRpcClient | null>(null)

function applyStatus(client: DevframeRpcClient): void {
  connection.status = client.status
  connection.connected = client.status === 'connected'
  connection.error = client.connectionError?.message ?? null
}

/** Establish the devframe connection and keep `connection` in sync with it. */
export async function connect(): Promise<void> {
  try {
    const client = await connectCodeServer()
    rpcRef.value = client
    connection.backend = client.connectionMeta.backend
    applyStatus(client)
    // Reflect the live connection: a dropped socket or refused auth swaps the
    // panel to a clear state instead of leaving a stale/blank editor.
    client.events.on('connection:status', () => applyStatus(client))
    // Best-effort trust handshake — shared-state subscription needs it, so kick
    // it off and ignore failures/timeouts on the single-user standalone server.
    if (client.connectionMeta.backend === 'websocket')
      client.ensureTrusted(5000).catch(() => {})
  }
  catch (e) {
    connection.status = 'error'
    connection.error = (e as Error)?.message ?? String(e)
  }
}

export function useRpc() {
  return rpcRef
}
