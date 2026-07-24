<script setup lang="ts">
import type { DevframeMessageEntry, DevframeMessageEntryFrom } from '@devframes/hub/types'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import FeedbackSpinner from '@antfu/design/components/Feedback/FeedbackSpinner.vue'
import LayoutSeparator from '@antfu/design/components/Layout/LayoutSeparator.vue'
import { useClipboard, useTimeAgo } from '@vueuse/core'
import { computed } from 'vue'
import { fromEntries, levels } from './message-styles'

const props = defineProps<{
  entry: DevframeMessageEntry
  /** Show the "open file" affordance for entries with a `filePosition`. */
  canOpenFile?: boolean
}>()

const emit = defineEmits<{
  close: []
  dismiss: [id: string]
  openFile: [entry: DevframeMessageEntry]
  toggleCategory: [category: string]
  toggleLabel: [label: string]
}>()

const timeAgo = useTimeAgo(computed(() => props.entry.timestamp))
const { copy: copyStacktrace, copied: stacktraceCopied } = useClipboard()

const from = computed(() => fromEntries[props.entry.from as DevframeMessageEntryFrom])

function formatAbsoluteTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

function filePositionLabel(pos: NonNullable<DevframeMessageEntry['filePosition']>): string {
  let path = pos.file
  if (pos.line)
    path += `:${pos.line}`
  if (pos.column)
    path += `:${pos.column}`
  return path
}
</script>

<template>
  <div class="h-full of-y-auto border-l border-base p-4">
    <!-- Header -->
    <div class="flex items-start gap-2 mb-3">
      <div class="flex-1 font-medium text-lg">
        {{ entry.message }}
      </div>
      <ActionIconButton
        icon="i-ph:trash-duotone"
        tooltip="Dismiss"
        label="Dismiss"
        @click="emit('dismiss', entry.id)"
      />
      <ActionIconButton
        icon="i-ph:x"
        tooltip="Close detail"
        label="Close detail"
        @click="emit('close')"
      />
    </div>

    <!-- Metadata row -->
    <div class="flex flex-wrap items-center gap-2 mb-3 text-xs">
      <span class="flex items-center gap-1" :class="levels[entry.level].color">
        <div :class="levels[entry.level].icon" class="w-3.5 h-3.5" />
        <span class="capitalize">{{ entry.level }}</span>
      </span>
      <span v-if="from" class="flex items-center gap-1" :class="from.color">
        <div :class="from.icon" class="w-3.5 h-3.5" />
        {{ from.label }}
      </span>
      <span v-if="entry.status === 'loading'" class="flex items-center gap-1 text-amber">
        <FeedbackSpinner size="0.75rem" />
        Loading
      </span>
      <span class="op40" :title="formatAbsoluteTime(entry.timestamp)">
        {{ timeAgo }}
      </span>
      <span v-if="entry.notify" class="flex items-center gap-0.5 op40">
        <div class="i-ph:bell-duotone w-3.5 h-3.5" />
        notify
      </span>
    </div>

    <!-- Description -->
    <div v-if="entry.description" class="text-sm op80 mb-3 whitespace-pre-wrap">
      {{ entry.description }}
    </div>

    <!-- Category + Labels -->
    <div v-if="entry.category || entry.labels?.length" class="flex flex-wrap gap-1 mb-3">
      <DisplayBadge v-if="entry.category" :text="entry.category" as="button" class="text-xs cursor-pointer" @click="emit('toggleCategory', entry.category)" />
      <DisplayBadge v-for="label of entry.labels" :key="label" :text="label" as="button" class="text-xs cursor-pointer" @click="emit('toggleLabel', label)" />
    </div>

    <!-- File position -->
    <button
      v-if="entry.filePosition && canOpenFile"
      type="button"
      class="flex items-start gap-1.5 text-left text-sm color-active hover:underline mb-3 break-all"
      @click="emit('openFile', entry)"
    >
      <div class="i-ph:file-code-duotone w-4 h-4 flex-none mt-0.5" />
      <span>{{ filePositionLabel(entry.filePosition) }}</span>
    </button>
    <div
      v-else-if="entry.filePosition"
      class="flex items-start gap-1.5 text-sm op60 mb-3 break-all"
    >
      <div class="i-ph:file-code-duotone w-4 h-4 flex-none mt-0.5" />
      <span>{{ filePositionLabel(entry.filePosition) }}</span>
    </div>

    <!-- Element position -->
    <div v-if="entry.elementPosition" class="text-sm mb-3 bg-gray/5 rounded p-2">
      <div class="op50 text-xs mb-1">
        Element
      </div>
      <div v-if="entry.elementPosition.selector" class="font-mono text-xs">
        {{ entry.elementPosition.selector }}
      </div>
      <div v-if="entry.elementPosition.description" class="text-xs op70 mt-1">
        {{ entry.elementPosition.description }}
      </div>
      <div v-if="entry.elementPosition.boundingBox" class="text-xs op50 mt-1 font-mono">
        {{ entry.elementPosition.boundingBox.x }}, {{ entry.elementPosition.boundingBox.y }}
        ({{ entry.elementPosition.boundingBox.width }} × {{ entry.elementPosition.boundingBox.height }})
      </div>
    </div>

    <!-- Stacktrace -->
    <div v-if="entry.stacktrace" class="mb-3">
      <div class="op50 text-xs mb-1">
        Stack Trace
      </div>
      <div class="group relative">
        <pre class="text-xs bg-gray/5 rounded p-2 of-x-auto whitespace-pre-wrap font-mono">{{ entry.stacktrace }}</pre>
        <ActionIconButton
          compact
          class="absolute top-1.5 right-1.5 op0 group-hover:op100 text-xs bg-base border border-base"
          :icon="stacktraceCopied ? 'i-ph:check' : 'i-ph:copy'"
          tooltip="Copy"
          label="Copy stack trace"
          @click="copyStacktrace(entry.stacktrace)"
        />
      </div>
    </div>

    <!-- Timers -->
    <div v-if="entry.autoDismiss || entry.autoDelete" class="flex flex-wrap gap-3 mb-3 text-xs op50">
      <span v-if="entry.autoDismiss" class="flex items-center gap-1">
        <div class="i-ph:bell-slash-duotone w-3.5 h-3.5" />
        Auto-dismiss: {{ entry.autoDismiss / 1000 }}s
      </span>
      <span v-if="entry.autoDelete" class="flex items-center gap-1">
        <div class="i-ph:timer-duotone w-3.5 h-3.5" />
        Auto-delete: {{ entry.autoDelete / 1000 }}s
      </span>
    </div>

    <!-- ID + Timestamp -->
    <LayoutSeparator />
    <div class="flex flex-col gap-1 text-xs op40 font-mono">
      <span>ID: {{ entry.id }}</span>
      <span>{{ formatAbsoluteTime(entry.timestamp) }} ({{ new Date(entry.timestamp).toLocaleDateString() }})</span>
    </div>
  </div>
</template>
