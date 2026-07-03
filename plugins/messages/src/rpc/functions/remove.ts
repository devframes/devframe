import { defineMessagesRpc, getMessagesHost } from './_define'

/** Remove (dismiss) a single message entry by id. */
export const messagesRemove = defineMessagesRpc({
  name: 'devframes-plugin-messages:remove',
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (id: string): Promise<void> => {
      await getMessagesHost(ctx)?.remove(id)
    },
  }),
})
