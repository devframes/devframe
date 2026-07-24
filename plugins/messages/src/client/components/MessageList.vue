<script setup lang="ts">
import type { DevframeMessageEntry } from '@devframes/hub/types'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import FeedbackEmptyState from '@antfu/design/components/Feedback/FeedbackEmptyState.vue'
import MessageItem from './MessageItem.vue'

defineProps<{
  entries: DevframeMessageEntry[]
  selectedId: string | null
}>()

defineEmits<{
  select: [id: string]
  dismiss: [id: string]
}>()
</script>

<template>
  <div class="h-full of-y-auto">
    <FeedbackEmptyState
      v-if="entries.length === 0"
      icon="i-ph:tray-duotone"
      title="No messages"
    />
    <div
      v-for="entry of entries"
      :key="entry.id"
      :data-selected="selectedId === entry.id || undefined"
      class="w-full text-left border-b border-base hover:bg-active transition text-sm group cursor-pointer"
      :class="[selectedId === entry.id ? 'bg-active' : '']"
      @click="$emit('select', entry.id)"
    >
      <MessageItem :entry class="px-3 py-2.5">
        <template #actions>
          <ActionIconButton
            compact
            class="op0 group-hover:op100 flex-none text-xs"
            icon="i-ph:trash-duotone"
            tooltip="Dismiss"
            label="Dismiss"
            @click.stop="$emit('dismiss', entry.id)"
          />
        </template>
      </MessageItem>
    </div>
  </div>
</template>
