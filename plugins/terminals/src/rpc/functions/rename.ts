import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'

export const rename = defineRpcFunction({
  name: 'devframes-plugin-terminals:rename',
  type: 'action',
  jsonSerializable: true,
  args: [v.object({ id: v.string(), title: v.string() })],
  returns: v.void(),
  setup: ctx => ({
    handler: ({ id, title }) => {
      getTerminalManager(ctx).rename(id, title)
    },
  }),
})
