import type { CodeServerStatusResult } from '../../types'
import { defineRpcFunction } from 'devframe'
import { getCodeServerSupervisor } from '../../node/context'

export const stop = defineRpcFunction({
  name: 'devframes:plugin:code-server:stop',
  type: 'action',
  jsonSerializable: true,
  agent: {
    description: 'Stop the running code-server editor process.',
    safety: 'action',
  },
  setup: ctx => ({
    handler: (): CodeServerStatusResult => getCodeServerSupervisor(ctx).stop(),
  }),
})
