import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { getTerminalManager } from '../../node/context'
import { presetSchema } from '../schemas'

export const presets = defineRpcFunction({
  name: 'devframes:plugin:terminals:presets',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  args: [],
  returns: v.array(presetSchema),
  setup: ctx => ({
    handler: () => getTerminalManager(ctx).getPresets().map(p => ({
      id: p.id,
      title: p.title,
      command: p.command,
      args: p.args ?? [],
      mode: p.mode ?? 'readonly',
      icon: p.icon,
    })),
  }),
})
