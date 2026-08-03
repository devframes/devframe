import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../node/context'

export const write = defineRpcFunction({
  name: 'devframes:plugin:terminals:write',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({ id: s.string(), data: s.string() })],
  returns: s.void(),
  setup: ctx => ({
    handler: ({ id, data }) => {
      getTerminalManager(ctx).write(id, data)
    },
  }),
})
