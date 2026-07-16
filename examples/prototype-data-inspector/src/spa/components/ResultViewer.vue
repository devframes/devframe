<script setup lang="ts">
import type { QueryStats } from '../../rpc-contract'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayBytes from '@antfu/design/components/Display/DisplayBytes.vue'
import DisplayDuration from '@antfu/design/components/Display/DisplayDuration.vue'
import { shallowRef, watch } from 'vue'
import { useDiscoveryViewer } from '../composables/discovery'
import { prepareForDisplay } from '../composables/display-transform'
import { colorScheme } from '../composables/scheme'

const props = defineProps<{
  result: unknown
  hasResult: boolean
  stats: (QueryStats & { rpcMs: number }) | null
  statsStale: boolean
  error: string | null
  running: boolean
}>()

const emit = defineEmits<{
  rerun: []
  /** From the struct's value actions: replace the query with this jora path. */
  querySubquery: [path: string]
  /** From the struct's value actions: append this jora path to the query. */
  queryAppend: [path: string]
}>()

const containerEl = shallowRef<HTMLElement | null>(null)
const viewer = useDiscoveryViewer(containerEl, colorScheme, { view: 'struct', expanded: 2 }, {
  onQuerySubquery: path => emit('querySubquery', path),
  onQueryAppend: path => emit('queryAppend', path),
})

watch(() => props.result, (value) => {
  if (props.hasResult)
    void viewer.setData(prepareForDisplay(value))
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="flex items-center gap-3 px-3 py-1.5 border-b border-base min-h-9 text-xs color-muted font-mono tabular-nums" :class="{ 'op-fade': statsStale }">
      <template v-if="stats">
        <span class="flex items-center gap-1"><span class="op50">jora</span> <DisplayDuration :ms="stats.queryMs" colorize /></span>
        <div class="h-full border-r border-base" />
        <span class="flex items-center gap-1"><span class="op50">normalize</span> <DisplayDuration :ms="stats.normalize.ms" colorize /></span>
        <div class="h-full border-r border-base" />
        <span class="flex items-center gap-1"><span class="op50">rpc</span> <DisplayDuration :ms="stats.rpcMs" colorize /></span>
        <div class="h-full border-r border-base" />
        <span class="flex items-center gap-1"><span class="op50">payload</span> <DisplayBytes :bytes="stats.payloadBytes" colorize /></span>
        <div class="h-full border-r border-base" />
        <span>{{ stats.normalize.nodes }} <span class="op50">nodes</span></span>
        <template v-if="stats.normalize.refs">
          <div class="h-full border-r border-base" />
          <span>{{ stats.normalize.refs }} <span class="op50">refs</span></span>
        </template>
        <DisplayBadge v-if="stats.normalize.truncatedEntries || stats.normalize.truncatedDepth" :color="12" text="truncated" />
      </template>
      <span v-else class="op-fade select-none">no query run yet</span>
      <div class="flex-1" />
      <span v-if="running" class="flex items-center gap-1.5 color-faint">
        <span class="i-ph:circle-notch animate-spin" />
        running
      </span>
      <ActionIconButton
        size="sm"
        :icon="running ? 'i-ph:arrows-clockwise animate-spin' : 'i-ph:arrows-clockwise'"
        label="Re-run query"
        tooltip="Re-run against the live object"
        :disabled="running"
        @click="emit('rerun')"
      />
    </div>

    <div
      v-if="error"
      class="mx-3 mt-2 px-3 py-2 font-mono text-xs whitespace-pre-wrap rounded-lg border border-red-600/40 bg-red-500:8 color-red-700 dark:(border-red-400/40 color-red-300)"
    >
      {{ error }}
    </div>

    <div v-show="hasResult" ref="containerEl" class="di-result-host flex-1 min-h-0 overflow-auto" />
    <div v-if="!hasResult" class="flex-1 grid place-items-center select-none">
      <div class="flex flex-col items-center gap-2 color-faint">
        <span class="i-ph:tree-structure-duotone text-3xl" />
        <span class="text-sm">Results render here, start typing a query</span>
      </div>
    </div>
  </div>
</template>
