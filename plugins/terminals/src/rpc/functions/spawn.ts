import { defineRpcFunction } from 'devframe'
import { getTerminalManager } from '../../node/context'
import { sessionInfoSchema, spawnRequestSchema } from '../schemas'

export const spawn = defineRpcFunction({
  name: 'devframes:plugin:terminals:spawn',
  type: 'action',
  jsonSerializable: true,
  args: [spawnRequestSchema],
  returns: sessionInfoSchema,
  agent: {
    description: 'Spawn a new terminal session. Pass a preset id, or a command + mode. Interactive sessions accept input; readonly sessions only stream output.',
    safety: 'action',
  },
  setup: ctx => ({
    handler: req => getTerminalManager(ctx).spawn(req ?? {}),
  }),
})
