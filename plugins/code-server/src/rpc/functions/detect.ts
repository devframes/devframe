import type { CodeServerDetection } from '../../types'
import { defineRpcFunction } from 'devframe'
import { getCodeServerSupervisor } from '../../node/context'

export const detect = defineRpcFunction({
  name: 'devframes-plugin-code-server:detect',
  type: 'query',
  jsonSerializable: true,
  agent: {
    description: 'Check whether the code-server binary is installed locally, returning its version when found.',
    safety: 'read',
  },
  setup: ctx => ({
    handler: (): Promise<CodeServerDetection> => getCodeServerSupervisor(ctx).detect(),
  }),
})
