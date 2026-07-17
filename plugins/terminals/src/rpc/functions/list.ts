import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'
import { sessionInfoSchema } from '../schemas'

export const list = defineRpcFunction({
  name: 'devframes:plugin:terminals:list',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  args: [],
  returns: v.array(sessionInfoSchema),
  agent: {
    description: 'List the current terminal sessions with their status, mode, and command.',
    safety: 'read',
  },
  setup: ctx => ({
    handler: () => getTerminalManager(ctx).list(),
  }),
})
