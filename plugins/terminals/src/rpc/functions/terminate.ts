import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'

export const terminate = defineRpcFunction({
  name: 'devframes:plugin:terminals:terminate',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({ id: v.string() })],
  returns: v.void(),
  agent: {
    description: 'Terminate a terminal session\'s running process. The session and its scrollback are kept; use restart to run it again.',
    safety: 'destructive',
  },
  setup: ctx => ({
    handler: ({ id }) => {
      getTerminalManager(ctx).terminate(id)
    },
  }),
})
