import type { DevframeMessagesListDelta } from '../../types'
import { defineMessagesRpc, getMessagesHost } from './_define'

/**
 * Read the message list incrementally. Pass the `version` from the previous
 * result as `since` to receive only what changed; omit it for the initial
 * full snapshot. Apply `removedIds` before upserting `entries`.
 *
 * `snapshot: true` bakes the full list into static builds, so the panel
 * renders the last captured feed without a live server.
 */
export const messagesList = defineMessagesRpc({
  name: 'devframes-plugin-messages:list',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  agent: {
    title: 'List messages',
    description: 'List the hub message feed — diagnostics, notifications, and tool output entries with level, category, labels, and positions.',
  },
  setup: ctx => ({
    handler: async (since?: number | null): Promise<DevframeMessagesListDelta> => {
      const host = getMessagesHost(ctx)
      if (!host)
        return { entries: [], removedIds: [], version: 0, full: true }
      return host.listSince(since)
    },
  }),
})
