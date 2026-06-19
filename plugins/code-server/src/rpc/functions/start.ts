import type { CodeServerStartRequest, CodeServerStartResult } from '../../types'
import { defineRpcFunction } from 'devframe'
import { getCodeServerSupervisor } from '../../node/context'

export const start = defineRpcFunction({
  name: 'devframes-plugin-code-server:start',
  type: 'action',
  jsonSerializable: true,
  agent: {
    description: 'Launch the code-server editor (if not already running) and wait until it is ready. Optionally open a specific workspace folder.',
    safety: 'action',
  },
  setup: ctx => ({
    handler: (req: CodeServerStartRequest = {}): Promise<CodeServerStartResult> =>
      getCodeServerSupervisor(ctx).start(req),
  }),
})
