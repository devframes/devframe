<script setup lang="ts">
import type { DataSourceMeta } from '../../engine'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { computed } from 'vue'

const props = defineProps<{
  source: DataSourceMeta | undefined
  /** The source's type skeleton (from the skeleton backend call); only depth 1 is shown. */
  skeleton: unknown
  error: string | null
  loading: boolean
}>()

const emit = defineEmits<{
  refresh: []
  /** A property was clicked: set it as the query. */
  select: [key: string]
}>()

interface OverviewEntry {
  key: string
  label: string
}

/** Compact one-level type label for a skeleton value. */
function labelOf(value: unknown): string {
  if (typeof value === 'string') {
    if (value === '...' || value === '[circular]')
      return 'object'
    return value // 'string' | 'number' | 'function' | 'Date' | 'Map(0)' | ...
  }
  if (Array.isArray(value))
    return 'array'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.$class === 'string')
      return `class ${record.$class}`
    const keys = Object.keys(record)
    const collection = keys.find(k => /^(?:Map|Set)\(\d+\)$/.test(k))
    if (collection)
      return collection
    return 'object'
  }
  return String(value)
}

const entries = computed<OverviewEntry[]>(() => {
  const { skeleton } = props
  if (!skeleton || typeof skeleton !== 'object' || Array.isArray(skeleton))
    return []
  return Object.entries(skeleton as Record<string, unknown>)
    .filter(([key]) => key !== '$class' && key !== '...')
    .map(([key, value]) => ({ key, label: labelOf(value) }))
})

/** The skeleton root when it is not a plain object (array, primitive, ...). */
const rootLabel = computed(() => {
  const { skeleton } = props
  if (skeleton === undefined || entries.value.length)
    return null
  return labelOf(skeleton)
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="flex gap-2">
      <div v-if="source?.description" class="text-sm op-fade">
        {{ source.description }}
      </div>
      <div class="flex-auto" />
      <ActionIconButton
        size="sm"
        :icon="loading ? 'i-ph:arrows-clockwise animate-spin' : 'i-ph:arrows-clockwise'"
        label="Refresh data shape"
        tooltip="Refresh"
        :disabled="loading"
        @click="emit('refresh')"
      />
    </div>

    <div
      v-if="error"
      class="mx-1 mb-1 px-2.5 py-1.5 font-mono text-11px rounded-lg border border-red-600/40 bg-red-500:8 color-red-700 dark:(border-red-400/40 color-red-300)"
    >
      {{ error }}
    </div>

    <!-- One-level data shape as a plain code block; click a prop to query it. -->
    <div class="flex-1 min-h-0 overflow-auto font-mono max-h50 overflow-auto text-xs border border-base rounded-lg px-3 py-2">
      <template v-if="entries.length">
        <div class="op50 select-none">
          {
        </div>
        <div v-for="entry in entries" :key="entry.key" class="pl-4 whitespace-nowrap">
          <button
            type="button"
            class="color-active hover:underline cursor-pointer"
            :title="`Query ${entry.key}`"
            @click="emit('select', entry.key)"
          >
            {{ entry.key }}
          </button><span class="op50">: {{ entry.label }},</span>
        </div>
        <div class="op50 select-none">
          }
        </div>
      </template>
      <span v-else-if="rootLabel" class="op50">{{ rootLabel }}</span>
      <span v-else class="op50">loading shape...</span>
    </div>
  </div>
</template>
