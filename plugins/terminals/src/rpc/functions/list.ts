import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../node/context'
import { sessionInfoSchema } from '../schemas'

export const list = defineRpcFunction({
  name: 'devframes:plugin:terminals:list',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  args: [],
  returns: s.array(sessionInfoSchema),
  agent: {
    description: 'List the current terminal sessions with their status, mode, and command.',
    safety: 'read',
  },
  setup: ctx => ({
    handler: () => getTerminalManager(ctx).list(),
  }),
})
