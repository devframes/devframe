import type { InvokeResult } from '../../types'
import { defineInspectRpc } from './_define'
import { toInvokeResult } from './_invoke-result'

export const readAgentResource = defineInspectRpc({
  name: 'devframes:plugin:inspect:read-agent-resource',
  type: 'action',
  setup: ctx => ({
    handler: (id: string): Promise<InvokeResult> =>
      toInvokeResult(() => ctx.agent.read(id)),
  }),
})
