import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'

export const resize = defineRpcFunction({
  name: 'devframes-plugin-terminals:resize',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({
    id: v.string(),
    cols: v.pipe(v.number(), v.integer(), v.minValue(1)),
    rows: v.pipe(v.number(), v.integer(), v.minValue(1)),
  })],
  returns: v.void(),
  setup: ctx => ({
    handler: ({ id, cols, rows }) => {
      getTerminalManager(ctx).resize(id, cols, rows)
    },
  }),
})
