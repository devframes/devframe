import type { DevframeMessageEntry, DevframeMessagesListDelta, DevframeRpcClientFunctions } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { Reactive } from 'vue'
import { reactive } from 'vue'
import { addToast } from './toasts'

export interface MessagesState {
  entries: DevframeMessageEntry[]
  unreadCount: number
  pendingSelectId: string | null
}

let _messagesState: Reactive<MessagesState> | undefined

export function useMessages(context: DocksContext): Reactive<MessagesState> {
  if (_messagesState)
    return _messagesState

  const state: Reactive<MessagesState> = _messagesState = reactive({
    entries: [],
    unreadCount: 0,
    pendingSelectId: null,
  })

  const entryMap = new Map<string, DevframeMessageEntry>()
  let isInitialFetch = true
  let lastVersion: number | null = null

  async function updateMessages() {
    // The feed is served by `@devframes/plugin-messages` (the hub itself ships
    // no list RPC). Cast because the plugin's RPC augmentation is not imported
    // here — hub-ui must not depend on the plugin package.
    const result = await context.rpc.call(
      'devframes:plugin:messages:list' as any,
      lastVersion,
    ) as DevframeMessagesListDelta
    let newCount = 0

    // A full snapshot resets any locally cached list before applying it.
    if (result.full)
      entryMap.clear()

    // Apply removals
    for (const id of result.removedIds)
      entryMap.delete(id)

    // Apply new/updated entries
    for (const entry of result.entries) {
      const prev = entryMap.get(entry.id)
      if (!prev) {
        newCount++
        if (isInitialFetch) {
          // On initial fetch (page refresh), only toast entries still loading
          if (entry.notify && entry.status === 'loading')
            addToast(entry)
        }
        else {
          if (entry.notify)
            addToast(entry)
        }
      }
      else if (entry.notify && JSON.stringify(entry) !== JSON.stringify(prev)) {
        addToast(entry)
      }
      entryMap.set(entry.id, entry)
    }

    state.entries = Array.from(entryMap.values())
    state.unreadCount += newCount
    lastVersion = result.version
    isInitialFetch = false
  }

  // A hub without `@devframes/plugin-messages` serves no list RPC — degrade
  // to an empty feed instead of surfacing unhandled rejections.
  const refresh = () => updateMessages().catch(() => {})

  context.rpc.client.register({
    name: 'devframe:messages:updated' satisfies keyof DevframeRpcClientFunctions,
    type: 'action',
    handler: () => {
      if (context.rpc.isTrusted)
        refresh()
    },
  })

  context.rpc.ensureTrusted().then(() => refresh())
  return state
}

export function selectMessage(id: string): void {
  if (_messagesState)
    _messagesState.pendingSelectId = id
}
