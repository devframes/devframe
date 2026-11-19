import type { BrowserAgentClientInfo, BrowserAgentToolManifest } from '../../client/browser-agent'
import { defineRpcFunction } from 'devframe'
import { syncClientAgentTools } from '../client-agent'

export const agentSyncClientTools = defineRpcFunction({
  name: 'devframe:agent:sync-client-tools',
  type: 'action',
  jsonSerializable: true,
  setup: context => ({
    handler(clientId: string, tools: BrowserAgentToolManifest[], info: BrowserAgentClientInfo): void {
      const session = context.rpc.getCurrentRpcSession()
      if (session)
        syncClientAgentTools(context, session, clientId, tools, info)
    },
  }),
})
