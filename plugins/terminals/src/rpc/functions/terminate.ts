import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../node/context'

export const terminate = defineRpcFunction({
  name: 'devframes:plugin:terminals:terminate',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({ id: s.string() })],
  returns: s.void(),
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
