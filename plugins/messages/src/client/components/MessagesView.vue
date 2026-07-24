<script setup lang="ts">
import type { DevframeMessageAction, DevframeMessageEntry } from '@devframes/hub/types'
import type { MessageFilters } from '../composables/useMessageFilters'
import { computed, ref, watch } from 'vue'
import MessageDetail from './MessageDetail.vue'
import MessageFilterBar from './MessageFilterBar.vue'
import MessageList from './MessageList.vue'

// The dumb view: filter/search/sort state rides on the shared `filters` façade
// (owned by the smart `App.vue` so the nav bar can drive it too); per-entry
// mutations go out as emits (the wrapper maps them onto the
// `devframes:plugin:messages:*` RPCs).
//
// TODO(toasts): the upstream view also participates in toast selection —
// `pendingSelectId` (set by clicking a toast) selects + scrolls an entry into
// view, and `markMessagesAsRead()` resets the unread counter `onMounted`.
// Reintroduce both alongside a ToastOverlay port when a viewer needs them.

const props = defineProps<{
  filters: MessageFilters
  /** Show the "open file" affordance for entries with a `filePosition`. */
  canOpenFile?: boolean
  /** Show entry `actions` (dock navigation works only under a hub host). */
  canActivate?: boolean
}>()

const emit = defineEmits<{
  /** Dismiss (remove) one entry. */
  dismiss: [id: string]
  /** Open the entry's `filePosition` in the editor. */
  openFile: [entry: DevframeMessageEntry]
  /** Cancel an entry's `autoDelete` timer (viewing it pins it). */
  persist: [id: string]
  /** Run one of the entry's actions (e.g. navigate to a dock). */
  activate: [action: DevframeMessageAction]
}>()

const selectedId = ref<string | null>(null)

const selectedEntry = computed(() =>
  selectedId.value == null ? null : props.filters.allEntries.find(e => e.id === selectedId.value) ?? null)

// Viewing an auto-deleting entry pins it, so it can't vanish mid-read.
watch(selectedEntry, (entry) => {
  if (entry?.autoDelete)
    emit('persist', entry.id)
})

function toggleSelect(id: string): void {
  selectedId.value = selectedId.value === id ? null : id
}

function removeEntry(id: string): void {
  emit('dismiss', id)
  if (selectedId.value === id)
    selectedId.value = null
}
</script>

<template>
  <div class="w-full h-full grid grid-rows-[max-content_1fr]">
    <MessageFilterBar :filters />

    <div class="h-full of-hidden" :class="selectedEntry ? 'grid grid-cols-[1fr_1fr]' : ''">
      <MessageList
        :entries="filters.filteredEntries"
        :selected-id="selectedId"
        @select="toggleSelect"
        @dismiss="removeEntry"
      />

      <MessageDetail
        v-if="selectedEntry"
        :entry="selectedEntry"
        :can-open-file="canOpenFile"
        :can-activate="canActivate"
        @close="selectedId = null"
        @dismiss="removeEntry"
        @open-file="emit('openFile', $event)"
        @activate="emit('activate', $event)"
        @toggle-category="filters.toggleCategory"
        @toggle-label="filters.toggleLabel"
      />
    </div>
  </div>
</template>
