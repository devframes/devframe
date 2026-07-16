import type { DevframeMessageEntry, DevframeMessageEntryInput } from '../../types'
import { defineMessagesRpc, getMessagesHost } from './_define'

/**
 * Add a message entry from a browser client. The origin is force-stamped
 * `from: 'browser'` so client-originated entries can't impersonate the
 * server. Returns the stored entry (with generated id/timestamp), or `null`
 * when no messages host is attached.
 */
export const messagesAdd = defineMessagesRpc({
  name: 'devframes:plugin:messages:add',
  type: 'action',
  jsonSerializable: true,
  setup: ctx => ({
    handler: async (input: DevframeMessageEntryInput): Promise<DevframeMessageEntry | null> => {
      const host = getMessagesHost(ctx)
      if (!host)
        return null
      const handle = await host.add({ ...input, from: 'browser' } as DevframeMessageEntryInput)
      return handle.entry
    },
  }),
})
