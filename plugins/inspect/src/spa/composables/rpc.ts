import type { DevframeRpcClient } from '@devframes/plugin-inspect/client'
import { connectInspect } from '@devframes/plugin-inspect/client'
import { reactive, shallowRef } from 'vue'
import { addHistoryRecord } from './history'

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

function setupHistoryHooks(client: DevframeRpcClient) {
  // Wrap outgoing calls
  const origCall = client.call.bind(client)
  client.call = async (method: string, ...args: any[]) => {
    const start = Date.now()
    try {
      const res = await origCall(method, ...args)
      if (!method.includes('list-functions') && !method.includes('list-state-keys') && method !== 'devframe:rpc:server-state:get') {
        addHistoryRecord({ type: 'call', method, args, result: res, duration: Date.now() - start, time: start })
      }
      return res
    } catch (e) {
      if (!method.includes('list-functions') && !method.includes('list-state-keys') && method !== 'devframe:rpc:server-state:get') {
        addHistoryRecord({ type: 'call', method, args, error: e, duration: Date.now() - start, time: start })
      }
      throw e
    }
  }

  const origCallEvent = client.callEvent.bind(client)
  client.callEvent = (method: string, ...args: any[]) => {
    if (!method.includes('list-functions') && !method.includes('list-state-keys') && method !== 'devframe:rpc:server-state:subscribe') {
      addHistoryRecord({ type: 'call', method, args, duration: 0, time: Date.now() })
    }
    return origCallEvent(method, ...args)
  }

  // Hook into state updates
  // We can patch the client definition for state updates to catch all broadcasts
  const updatedDef = client.client.get('devframe:rpc:client-state:updated')
  if (updatedDef && updatedDef.handler) {
    const origUpdated = updatedDef.handler
    updatedDef.handler = (key: string, fullState: any, syncId: string) => {
      addHistoryRecord({ type: 'state', key, value: fullState, syncId, time: Date.now() })
      return origUpdated(key, fullState, syncId)
    }
  }

  const patchDef = client.client.get('devframe:rpc:client-state:patch')
  if (patchDef && patchDef.handler) {
    const origPatch = patchDef.handler
    patchDef.handler = (key: string, patches: any, syncId: string) => {
      addHistoryRecord({ type: 'state', key, patches, syncId, time: Date.now() })
      return origPatch(key, patches, syncId)
    }
  }
}

export async function connect(): Promise<void> {
  try {
    const client = await connectInspect()
    setupHistoryHooks(client)
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
