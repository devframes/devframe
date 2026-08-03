import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../node/context'

export const remove = defineRpcFunction({
  name: 'devframes:plugin:terminals:remove',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({ id: s.string() })],
  returns: s.void(),
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
