import type { InvokeResult } from '../../types'
import { defineInspectRpc } from './_define'
import { toInvokeResult } from './_invoke-result'

export const invokeAgentTool = defineInspectRpc({
  name: 'devframes:plugin:inspect:invoke-agent-tool',
  type: 'action',
  setup: ctx => ({
    handler: (id: string, args: unknown): Promise<InvokeResult> =>
      toInvokeResult(() => ctx.agent.invoke(id, args)),
  }),
})
