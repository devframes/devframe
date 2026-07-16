<script setup lang="ts">
import type { QueryStats } from '../../rpc-contract'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBytes from '@antfu/design/components/Display/DisplayBytes.vue'
import DisplayDuration from '@antfu/design/components/Display/DisplayDuration.vue'
import { shallowRef, watch } from 'vue'
import { useDiscoveryViewer } from '../composables/discovery'
import { colorScheme } from '../composables/scheme'

const props = defineProps<{
  result: unknown
  hasResult: boolean
  stats: (QueryStats & { rpcMs: number }) | null
  statsStale: boolean
  error: string | null
  running: boolean
}>()

const emit = defineEmits<{ rerun: [] }>()

const containerEl = shallowRef<HTMLElement | null>(null)
const viewer = useDiscoveryViewer(containerEl, colorScheme)

watch(() => props.result, (value) => {
  if (props.hasResult)
    void viewer.setData(value)
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="flex items-center gap-3 px-3 py-1.5 border-b border-base min-h-9 text-xs color-muted font-mono tabular-nums" :class="{ 'op-fade': statsStale }">
      <template v-if="stats">
        <span class="flex items-center gap-1">jora <DisplayDuration :ms="stats.queryMs" colorize /></span>
        <span class="flex items-center gap-1">normalize <DisplayDuration :ms="stats.normalize.ms" colorize /></span>
        <span class="flex items-center gap-1">rpc <DisplayDuration :ms="stats.rpcMs" colorize /></span>
        <span class="flex items-center gap-1">payload <DisplayBytes :bytes="stats.payloadBytes" colorize /></span>
        <span>{{ stats.normalize.nodes }} nodes</span>
        <span v-if="stats.normalize.refs">{{ stats.normalize.refs }} $refs</span>
        <span v-if="stats.normalize.truncatedEntries || stats.normalize.truncatedDepth" class="color-amber-600 dark:color-amber-400">truncated</span>
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
