import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'
import { getTerminalManager } from '../../context'
import { presetSchema } from '../schemas'

export const presets = defineRpcFunction({
  name: 'devframes:plugin:terminals:presets',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  args: [],
  returns: s.array(presetSchema),
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
