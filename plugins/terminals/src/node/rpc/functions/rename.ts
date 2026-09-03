import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../context'

export const rename = defineRpcFunction({
  name: 'devframes:plugin:terminals:rename',
  type: 'action',
  jsonSerializable: true,
  args: [s.object({ id: s.string(), title: s.string() })],
  returns: s.void(),
  setup: ctx => ({
    handler: ({ id, title }) => {
      getTerminalManager(ctx).rename(id, title)
    },
  }),
})
