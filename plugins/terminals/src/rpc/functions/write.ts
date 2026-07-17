import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'

export const write = defineRpcFunction({
  name: 'devframes:plugin:terminals:write',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({ id: v.string(), data: v.string() })],
  returns: v.void(),
  setup: ctx => ({
    handler: ({ id, data }) => {
      getTerminalManager(ctx).write(id, data)
    },
  }),
})
