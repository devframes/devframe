import type { DevframeMessageEntry, DevframeMessagesListDelta } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { Reactive } from 'vue'
import { HUB_EVENTS } from '@devframes/hub/constants'
import { reactive } from 'vue'
import { createToastStore } from './toasts'

export interface MessagesState {
  entries: DevframeMessageEntry[]
  toasts: ReturnType<typeof createToastStore>
  unreadCount: number
  pendingSelectId: string | null
}

function shouldToast(entry: DevframeMessageEntry, prev: DevframeMessageEntry | undefined, isInitialFetch: boolean): boolean {
  if (!entry.notify)
    return false
  if (!prev) {
    return isInitialFetch
      ? entry.status === 'loading'
      : true
  }
  return JSON.stringify(entry) !== JSON.stringify(prev)
}

const states = new WeakMap<DocksContext['rpc'], Reactive<MessagesState>>()

export function useMessages({ rpc }: DocksContext): Reactive<MessagesState> {
  const cached = states.get(rpc)
  if (cached)
    return cached

  const state: Reactive<MessagesState> = reactive({
    entries: [],
    toasts: createToastStore(),
    unreadCount: 0,
    pendingSelectId: null,
  })

  states.set(rpc, state)

  const entryMap = new Map<string, DevframeMessageEntry>()
  let isInitialFetch = true
  let lastVersion: number | null = null
  let lastInstanceId: string | null = null

  async function updateMessages() {
    // The feed is served by `@devframes/plugin-messages` (the hub itself ships
    // no list RPC). Cast because the plugin's RPC augmentation is not imported
    // here; hub-ui must not depend on the plugin package.
    const result = await rpc.call(
      'devframes:plugin:messages:list' as any,
      lastVersion,
      lastInstanceId,
    ) as DevframeMessagesListDelta
    let newCount = 0

    if (result.full && lastInstanceId != null && result.instanceId != null && lastInstanceId !== result.instanceId) {
      for (const id of entryMap.keys())
        state.toasts.dismiss(id)
      entryMap.clear()
      state.pendingSelectId = null
      state.unreadCount = 0
    }

    /** Preserve surviving entries so a full snapshot does not notify them again. */
    let removedIds = result.removedIds
    if (result.full) {
      const retainedIds = new Set(result.entries.map(entry => entry.id))
      removedIds = [
        ...entryMap.keys(),
      ].filter(id => !retainedIds.has(id))
    }
    for (const id of removedIds) {
      entryMap.delete(id)
      state.toasts.dismiss(id)
    }

    // Apply new/updated entries. On initial fetch (page refresh) only entries
    // still loading toast; afterwards any notifying new or changed entry does.
    for (const entry of result.entries) {
      const prev = entryMap.get(entry.id)
      if (!prev)
        newCount++
      if (shouldToast(entry, prev, isInitialFetch))
        state.toasts.add(entry)
      entryMap.set(entry.id, entry)
    }

    state.entries = Array.from(entryMap.values())
    state.unreadCount += newCount
    lastVersion = result.version
    lastInstanceId = result.instanceId ?? null
    isInitialFetch = false
  }

  // A hub without `@devframes/plugin-messages` serves no list RPC, so degrade
  // to an empty feed instead of surfacing unhandled rejections.
  let queue = Promise.resolve()
  const refresh = () => {
    queue = queue.then(updateMessages).catch(() => {})
    return queue
  }

  rpc.client.register({
    name: HUB_EVENTS.broadcast.messagesUpdated,
    type: 'action',
    handler: () => {
      if (rpc.isTrusted)
        refresh()
    },
  })

  // Background initialization waits for trust without a deadline. A page can
  // stay untrusted while the user authorizes DevTools, and the default 60s
  // deadline would only surface an unhandled rejection in the app.
  rpc.ensureTrusted(0).then(() => refresh())
  return state
}
