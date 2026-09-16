import type { BrowserAgentToolManifest } from '../../client/browser-agent'
import { defineRpcFunction } from 'devframe'
import { syncClientAgentTools } from '../client-agent'

export const agentSyncClientTools = defineRpcFunction({
  name: 'devframe:agent:sync-client-tools',
  type: 'action',
  jsonSerializable: true,
  setup: context => ({
    handler(tools: BrowserAgentToolManifest[]): void {
      const session = context.rpc.getCurrentRpcSession()
      if (session)
        syncClientAgentTools(context, session, tools)
    },
  }),
})
