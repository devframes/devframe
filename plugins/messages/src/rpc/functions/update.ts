import type { DevframeMessageEntry, DevframeMessageEntryInput } from '@devframes/hub/types'
import { defineMessagesRpc, getMessagesHost } from './_define'

/**
 * Partially update an existing message entry by id — e.g. the panel resets
 * `autoDelete` to keep an entry alive while its detail view is open. Returns
 * the updated entry, or `null` when the id is unknown or no messages host is
 * attached.
 */
export const messagesUpdate = defineMessagesRpc({
  name: 'devframes:plugin:messages:update',
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (id: string, patch: Partial<DevframeMessageEntryInput>): Promise<DevframeMessageEntry | null> => {
      const host = getMessagesHost(ctx)
      if (!host)
        return null
      return await host.update(id, patch) ?? null
    },
  }),
})
