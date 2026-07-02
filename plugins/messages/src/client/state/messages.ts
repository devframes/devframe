import type { DevframeRpcClient } from 'devframe/client'
import type { Reactive } from 'vue'
import type { DevframeMessageEntry, DevframeMessagesListDelta } from '../../types'
import { reactive } from 'vue'
import { MESSAGES_UPDATED_EVENT } from '../../constants'

export interface MessagesState {
  entries: DevframeMessageEntry[]
}

// TODO(toasts): vitejs/devtools layers toast notifications and unread
// tracking over this store — `notify` entries pop as toasts (`addToast`),
// never-seen entries bump an `unreadCount` reset by `markMessagesAsRead()`,
// and `selectMessage(id)` lets a toast click focus its entry in the view.
// Port those alongside a ToastOverlay component when a viewer needs them.

const states = new WeakMap<DevframeRpcClient, Reactive<MessagesState>>()

/**
 * Reactive mirror of the server-side message feed, one per RPC client.
 * Delta-synced: the initial call fetches the full snapshot, then every
 * `devframe:messages:updated` broadcast (and trust-state flip) re-fetches
 * incrementally using the version cursor from the previous result.
 */
export function useMessages(rpc: DevframeRpcClient): Reactive<MessagesState> {
  let state = states.get(rpc)
  if (state)
    return state
  state = reactive<MessagesState>({ entries: [] })
  states.set(rpc, state)

  const entryMap = new Map<string, DevframeMessageEntry>()
  let lastVersion: number | null = null

  // Serialize refreshes so a broadcast landing mid-fetch can't interleave
  // cursor updates; the cursor keeps each pass cheap.
  let queue: Promise<void> = Promise.resolve()
  function refresh(): Promise<void> {
    queue = queue.then(async () => {
      // Omit the cursor on the first call — static builds serve the baked
      // no-args snapshot; live servers return the full list either way.
      const result = (lastVersion == null
        ? await rpc.call('devframes-plugin-messages:list')
        : await rpc.call('devframes-plugin-messages:list', lastVersion)) as DevframeMessagesListDelta
      if (result.full)
        entryMap.clear()
      // Apply removals before upserts — an id can be evicted and re-added
      // within one delta window.
      for (const id of result.removedIds)
        entryMap.delete(id)
      for (const entry of result.entries)
        entryMap.set(entry.id, entry)
      state!.entries = Array.from(entryMap.values())
      lastVersion = result.version
    }).catch(() => {
      // Transport hiccup — the next broadcast or trust flip retries.
    })
    return queue
  }

  // React to the hub's change broadcast. Another consumer sharing this rpc
  // client (e.g. a host page embedding the panel) may have registered the
  // handler already — chain onto it instead of replacing it.
  const existing = rpc.client.definitions.get(MESSAGES_UPDATED_EVENT)
  if (existing) {
    const prev = existing.handler
    existing.handler = (...args: unknown[]) => {
      void refresh()
      return prev?.(...args)
    }
  }
  else {
    rpc.client.register({
      name: MESSAGES_UPDATED_EVENT,
      type: 'action',
      handler: () => {
        void refresh()
      },
    })
  }

  void refresh()
  // A hub host may gate data behind the trust handshake; re-sync once
  // this client becomes trusted.
  rpc.events.on('rpc:is-trusted:updated', (trusted) => {
    if (trusted)
      void refresh()
  })

  return state
}
