import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'

export const clearExited = defineRpcFunction({
  name: 'devframes:plugin:terminals:clear-exited',
  type: 'action',
  jsonSerializable: true,
  args: [],
  returns: v.void(),
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
