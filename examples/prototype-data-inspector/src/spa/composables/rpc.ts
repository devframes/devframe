/** PROTOTYPE — devframe connection state (mirrors plugins/inspect's composable). */
import type { DevframeConnectionStatus, DevframeRpcClient } from 'devframe/client'
import { connectDevframe } from 'devframe/client'
import { reactive, shallowRef } from 'vue'

export const connection = reactive<{
  connected: boolean
  status: DevframeConnectionStatus
  error: string | null
}>({
  connected: false,
  status: 'connecting',
  error: null,
})

const clientRef = shallowRef<DevframeRpcClient | null>(null)

function applyStatus(client: DevframeRpcClient): void {
  connection.status = client.status
  connection.connected = client.status === 'connected'
  connection.error = client.connectionError?.message ?? null
}

export async function connect(): Promise<void> {
  try {
    const client = await connectDevframe({ baseURL: '/' })
    clientRef.value = client
    applyStatus(client)
    client.events.on('connection:status', () => applyStatus(client))
    await client.ensureTrusted(10_000).catch(() => {})
    applyStatus(client)
  }
  catch (error) {
    connection.status = 'error'
    connection.error = error instanceof Error ? error.message : String(error)
  }
}

/** Untyped call escape hatch — prototype functions aren't module-augmented. */
export async function call<T>(name: string, ...args: unknown[]): Promise<T> {
  const client = clientRef.value
  if (!client)
    throw new Error('not connected')
  return (client.call as unknown as (name: string, ...args: unknown[]) => Promise<T>)(name, ...args)
}
