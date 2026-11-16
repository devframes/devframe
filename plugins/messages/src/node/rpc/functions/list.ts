import type { DevframeMessagesListDelta } from '@devframes/hub/types'
import type { DevframeNodeRpcSessionMeta } from 'devframe/types'
import { defineRpcFunction } from 'devframe'
import { getMessagesHost } from './_define'

/**
 * Read the message list incrementally. Pass the `version` from the previous
 * result as `since`, together with its `instanceId`, to receive only what
 * changed. Omit both for the initial full snapshot. Apply `removedIds` before upserting `entries`.
 *
 * `snapshot: true` bakes the full list into static builds, so the panel
 * renders the last captured feed without a live server.
 */
export const messagesList = defineRpcFunction({
  name: 'devframes:plugin:messages:list',
  type: 'query',
  jsonSerializable: true,
  snapshot: true,
  agent: {
    title: 'List messages',
    description: 'List the hub message feed: diagnostics, notifications, and tool output entries with level, category, labels, and positions.',
  },
  setup: (ctx) => {
    const cursors = new WeakMap<DevframeNodeRpcSessionMeta, Pick<DevframeMessagesListDelta, 'version' | 'instanceId'>>()
    return {
      async handler(this: { $meta?: DevframeNodeRpcSessionMeta } | void, since?: number | null, instanceId?: string | null): Promise<DevframeMessagesListDelta> {
        const host = getMessagesHost(ctx)
        if (!host) {
          return {
            entries: [],
            removedIds: [],
            version: 0,
            full: true,
          }
        }

        // Live RPC binds the peer to the handler. Local reads and static builds
        // have no peer and need no connection-specific cursor.
        const peer = this?.$meta
        const initial = peer && cursors.get(peer)
        const knownInstance = instanceId === undefined && initial && since != null && since >= initial.version
          ? initial.instanceId
          : instanceId
        const result = host.listSince(since, knownInstance)
        // A legacy reader starts with null, or presents an unknown number
        // on a fresh connection. Keep its snapshot cursor for overlapping reads.
        if (peer && instanceId === undefined && since !== undefined && result.full && (!initial || initial.instanceId !== result.instanceId))
          cursors.set(peer, { version: result.version, instanceId: result.instanceId })
        return result
      },
    }
  },
})
