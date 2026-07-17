import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'

export const remove = defineRpcFunction({
  name: 'devframes:plugin:terminals:remove',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({ id: v.string() })],
  returns: v.void(),
  agent: {
    description: 'Kill a terminal session and discard it (process, stream, and scrollback).',
    safety: 'destructive',
  },
  setup: ctx => ({
    handler: ({ id }) => {
      getTerminalManager(ctx).remove(id)
    },
  }),
})
