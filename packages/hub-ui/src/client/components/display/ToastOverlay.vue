<script setup lang="ts">
import type { DevframeMessageAction } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { MESSAGES_DOCK_ID } from '../../constants'
import { selectMessage, useMessages } from '../../state/messages'
import { dismissToast, useToasts } from '../../state/toasts'
import MessageItem from '../message/MessageItem.vue'

const props = defineProps<{
  context?: DocksContext
}>()

// Initialize messages state early so the RPC handler is registered
// and toasts are triggered even before the messages panel is opened
if (props.context)
  useMessages(props.context)

const toasts = useToasts()

function openMessages(toastId: string) {
  dismissToast(toastId)
  selectMessage(toastId)
  // Open the messages panel provided by `@devframes/plugin-messages`
  // (its dock id is the plugin's devframe id).
  props.context?.docks.switchEntry(MESSAGES_DOCK_ID)
}

/**
 * Mirrors `@devframes/plugin-messages`'s own `onActivate` dispatch (its
 * `App.vue`) - the toast's own `entry.actions` buttons behave identically to
 * the ones in the messages panel's detail view, without waiting for that
 * panel to be open. `context.docks`/`context.commands` reach the hub
 * directly here, whereas the plugin (an iframe) goes through RPC.
 */
function dispatchAction(action: DevframeMessageAction) {
  if (action.kind === 'activate')
    props.context?.docks.switchEntry(action.activate.dockId)
  else if (action.kind === 'command')
    props.context?.commands.execute(action.command.id, ...(action.command.params ?? []))
}
</script>

<template>
  <div
    v-if="toasts.length > 0"
    class="fixed bottom-4 right-4 z-dock-toast flex flex-col gap-2 pointer-events-auto w-72"
  >
    <TransitionGroup
      enter-active-class="transition-all duration-300 ease-out"
      leave-active-class="transition-all duration-200 ease-in"
      enter-from-class="opacity-0 translate-x-4"
      leave-to-class="opacity-0 translate-x-4"
    >
      <div
        v-for="toast of toasts"
        :key="toast.id"
        class="bg-toast-glass border color-base border-base shadow-xl cursor-pointer transition-colors rounded"
        @click="openMessages(toast.id)"
      >
        <MessageItem :entry="toast.entry" compact class="px-3 py-2.5">
          <template #actions>
            <button
              v-for="action of toast.entry.actions"
              :key="action.id"
              class="flex-none text-xs px-1.5 py-0.5 rounded border border-base op70 hover:op100 hover:bg-active transition"
              @click.stop="dispatchAction(action)"
            >
              {{ action.label }}
            </button>
            <button
              class="flex-none op30 hover:op100 p-0.5 rounded hover:bg-active transition"
              @click.stop="dismissToast(toast.id)"
            >
              <div class="i-ph-x w-3 h-3" />
            </button>
          </template>
        </MessageItem>
      </div>
    </TransitionGroup>
  </div>
</template>
