import type { CodeServerStatusResult } from '../../types'
import { defineRpcFunction } from 'devframe'
import { getCodeServerSupervisor } from '../../node/context'

export const status = defineRpcFunction({
  name: 'devframes:plugin:code-server:status',
  type: 'query',
  jsonSerializable: true,
  setup: ctx => ({
    handler: (): CodeServerStatusResult => getCodeServerSupervisor(ctx).status(),
  }),
})
