import type { BrowserAgentToolManifest } from './browser-agent'
import type { DevframeConnectionStatus } from './connection'
import {
  listBrowserAgentTools,
  onBrowserAgentToolsChanged,
} from './browser-agent'

export interface BrowserAgentInvocationDefinition {
  name: 'devframe:agent:invoke-client-tool'
  type: 'action'
  jsonSerializable: true
  handler: (id: string, args: Record<string, unknown>) => Promise<unknown>
}

interface BrowserAgentRpcClient {
  client: { register: (definition: BrowserAgentInvocationDefinition) => void }
  callOptional: (
    method: 'devframe:agent:sync-client-tools',
    tools: BrowserAgentToolManifest[],
  ) => Promise<unknown>
  events: {
    on: (
      event: 'connection:status',
      listener: (status: DevframeConnectionStatus, previous: DevframeConnectionStatus) => void,
    ) => () => void
  }
}

/** Mirror this document's browser-agent registry over its existing RPC connection. */
export function setupBrowserAgentRpcBridge(rpc: BrowserAgentRpcClient): () => void {
  rpc.client.register({
    name: 'devframe:agent:invoke-client-tool',
    type: 'action',
    jsonSerializable: true,
    handler: async (id: string, args: Record<string, unknown>) => {
      const tool = listBrowserAgentTools().find(tool => tool.id === id)
      if (!tool)
        throw new Error(`[devframe/agent] browser tool "${id}" not found`)
      return await tool.invoke(args)
    },
  })

  let queued = false
  let disposed = false
  const sync = (): void => {
    if (queued || disposed)
      return
    queued = true
    queueMicrotask(async () => {
      queued = false
      const manifests = listBrowserAgentTools().map(({ invoke: _, ...manifest }) => manifest)
      await rpc.callOptional('devframe:agent:sync-client-tools', manifests).catch(() => {})
    })
  }

  const stopTools = onBrowserAgentToolsChanged(sync)
  const stopConnection = rpc.events.on('connection:status', (status) => {
    if (status === 'connected')
      sync()
  })
  sync()

  return () => {
    disposed = true
    stopTools()
    stopConnection()
  }
}
