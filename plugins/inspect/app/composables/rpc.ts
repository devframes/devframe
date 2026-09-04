import type { DevframeConnectionStatus, DevframeRpcClient } from '../connect'
import { connectDevframe } from 'devframe/client'
import { reactive, shallowRef } from 'vue'
import { addHistoryRecord } from './history'

export const connection = reactive<{
  connected: boolean
  status: DevframeConnectionStatus
  error: string | null
  backend: 'websocket' | 'static' | 'sse' | 'none' | null
}>({
  connected: false,
  status: 'connecting',
  error: null,
  backend: null,
})

const rpcRef = shallowRef<DevframeRpcClient | null>(null)

function setupHistoryHooks(client: DevframeRpcClient) {
  // Wrap outgoing calls. The panel inspects arbitrary method ids as strings,
  // so widen the bound signatures past the typed `keyof` server-function map.
  const origCall = client.call.bind(client) as (method: string, ...args: any[]) => Promise<any>
  client.call = async (method: string, ...args: any[]) => {
    const start = Date.now()
    try {
      const res = await origCall(method, ...args)
      if (!method.includes('list-functions') && !method.includes('list-state-keys') && method !== 'devframe:rpc:server-state:get') {
        addHistoryRecord({ type: 'call', method, args, result: res, duration: Date.now() - start, time: start })
      }
      return res
    }
    catch (e) {
      if (!method.includes('list-functions') && !method.includes('list-state-keys') && method !== 'devframe:rpc:server-state:get') {
        addHistoryRecord({ type: 'call', method, args, error: e, duration: Date.now() - start, time: start })
      }
      throw e
    }
  }

  const origCallEvent = client.callEvent.bind(client) as (method: string, ...args: any[]) => any
  client.callEvent = (method: string, ...args: any[]) => {
    if (!method.includes('list-functions') && !method.includes('list-state-keys') && method !== 'devframe:rpc:server-state:subscribe') {
      addHistoryRecord({ type: 'call', method, args, duration: 0, time: Date.now() })
    }
    return origCallEvent(method, ...args)
  }

  // Hook into state updates: patch the client definition to catch all broadcasts.
  const updatedDef = client.client.definitions.get('devframe:rpc:client-state:updated')
  if (updatedDef && updatedDef.handler) {
    const origUpdated = updatedDef.handler
    updatedDef.handler = (key: string, fullState: any, syncId: string) => {
      addHistoryRecord({ type: 'state', key, value: fullState, syncId, time: Date.now() })
      return origUpdated(key, fullState, syncId)
    }
  }

  const patchDef = client.client.definitions.get('devframe:rpc:client-state:patch')
  if (patchDef && patchDef.handler) {
    const origPatch = patchDef.handler
    patchDef.handler = (key: string, patches: any, syncId: string) => {
      addHistoryRecord({ type: 'state', key, patches, syncId, time: Date.now() })
      return origPatch(key, patches, syncId)
    }
  }
}

function applyStatus(client: DevframeRpcClient): void {
  connection.status = client.status
  connection.connected = client.status === 'connected'
  connection.error = client.connectionError?.message ?? null
}

export async function connect(): Promise<void> {
  try {
    const client = await connectDevframe()
    setupHistoryHooks(client)
    rpcRef.value = client
    connection.backend = client.connectionMeta.backend
    applyStatus(client)
    // Reflect the live connection: a dropped socket or refused auth swaps the
    // panel to a clear state instead of leaving stale data on screen.
    client.events.on('connection:status', () => applyStatus(client))
    // Best-effort trust handshake; data calls succeed regardless on the
    // single-user standalone server, but shared-state subscription needs
    // it, so kick it off and ignore failures/timeouts.
    if (client.connectionMeta.backend === 'websocket')
      client.ensureTrusted(5000).catch(() => {})
  }
  catch (e) {
    // Failing to load the connection meta is a fatal connection error.
    connection.status = 'error'
    connection.error = (e as Error)?.message ?? String(e)
  }
}

export function useRpc() {
  return rpcRef
}

export function isStatic(): boolean {
  return connection.backend === 'static'
}
