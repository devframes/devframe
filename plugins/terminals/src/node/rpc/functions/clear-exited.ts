import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../context'

export const clearExited = defineRpcFunction({
  name: 'devframes:plugin:terminals:clear-exited',
  type: 'action',
  jsonSerializable: true,
  args: [],
  returns: s.void(),
  agent: {
    description: 'Discard every stopped (exited or errored) terminal session at once. Running sessions are left untouched.',
    safety: 'destructive',
  },
  setup: ctx => ({
    handler: () => {
      getTerminalManager(ctx).clearExited()
    },
  }),
})
