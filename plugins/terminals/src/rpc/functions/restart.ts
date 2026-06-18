import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'
import { sessionInfoSchema } from '../schemas'

export const restart = defineRpcFunction({
  name: 'devframes-plugin-terminals:restart',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({ id: v.string() })],
  returns: sessionInfoSchema,
  setup: ctx => ({
    handler: ({ id }) => getTerminalManager(ctx).restart(id),
  }),
})
