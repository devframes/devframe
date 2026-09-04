import { defineRpcFunction } from 'devframe'
import { getMessagesHost } from './_define'

/** Clear the whole message feed. */
export const messagesClear = defineRpcFunction({
  name: 'devframes:plugin:messages:clear',
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (): Promise<void> => {
      await getMessagesHost(ctx)?.clear()
    },
  }),
})
