<script setup lang="ts">
import type { DevframeMessageEntry } from '@devframes/hub/types'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import FeedbackSpinner from '@antfu/design/components/Feedback/FeedbackSpinner.vue'
import { useTimeAgo } from '@vueuse/core'
import { levels } from './message-styles'

const props = defineProps<{
  entry: DevframeMessageEntry
  compact?: boolean
}>()

const timeAgo = useTimeAgo(() => props.entry.timestamp)
</script>

<template>
  <div class="flex items-start gap-2 relative">
    <div class="w-2px flex-none absolute left-0 top-4px bottom-4px rounded-r" :class="[levels[entry.level]?.bg || 'bg-gray']" />

    <FeedbackSpinner
      v-if="entry.status === 'loading'"
      size="1rem"
      class="flex-none mt-0.5 op50"
    />
    <div
      v-else
      class="flex-none mt-0.5 w-4 h-4"
      :class="[levels[entry.level]?.icon, levels[entry.level]?.color]"
    />

    <div class="flex-1 min-w-0 space-y-0.5">
      <div class="flex items-center gap-2">
        <div class="flex-1 min-w-0 truncate text-sm font-medium" :class="[entry.status === 'loading' ? 'op60' : '']">
          {{ entry.message }}
        </div>
        <span v-if="!compact" class="text-xs op40 flex-none" :title="new Date(entry.timestamp).toLocaleString()">{{ timeAgo }}</span>
        <slot name="actions" />
      </div>
      <div v-if="entry.description" class="text-xs op80 whitespace-pre-wrap">
        {{ entry.description }}
      </div>
      <div v-if="!compact && (entry.category || entry.labels?.length)" class="flex flex-wrap items-center gap-1">
        <DisplayBadge v-if="entry.category" :text="entry.category" class="text-xs" />
        <DisplayBadge v-for="label of entry.labels" :key="label" :text="label" class="text-xs" />
      </div>
    </div>
  </div>
</template>
