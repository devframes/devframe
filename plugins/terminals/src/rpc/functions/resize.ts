import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../node/context'

export const resize = defineRpcFunction({
  name: 'devframes:plugin:terminals:resize',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({
    id: s.string(),
    cols: s.number(),
    rows: s.number(),
  })],
  returns: s.void(),
  setup: ctx => ({
    handler: ({ id, cols, rows }) => {
      getTerminalManager(ctx).resize(id, cols, rows)
    },
  }),
})
