import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../node/context'
import { sessionInfoSchema } from '../schemas'

export const restart = defineRpcFunction({
  name: 'devframes:plugin:terminals:restart',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({ id: s.string() })],
  returns: sessionInfoSchema,
  setup: ctx => ({
    handler: ({ id }) => getTerminalManager(ctx).restart(id),
  }),
})
