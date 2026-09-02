<script setup lang="ts">
import type { NodePath, QueryStats } from '../../engine'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import DisplayBytes from '@antfu/design/components/Display/DisplayBytes.vue'
import DisplayDate from '@antfu/design/components/Display/DisplayDate.vue'
import DisplayDuration from '@antfu/design/components/Display/DisplayDuration.vue'
import { computed, shallowRef, watch } from 'vue'
import { useDiscoveryViewer } from '../composables/discovery'
import { prepareForDisplay } from '../composables/display-transform'
import { colorScheme } from '../composables/scheme'
import EditPanel from './EditPanel.vue'

const props = defineProps<{
  result: unknown
  hasResult: boolean
  stats: (QueryStats & { rpcMs: number }) | null
  statsStale: boolean
  error: string | null
  running: boolean
  /** When the last successful query landed (ms epoch), or null before the first. */
  lastRunAt: number | null
  /** Live edits apply: writable source, identity view, rpc mode. */
  canEdit?: boolean
  /** Why editing is absent (drives the lock hint), or null when it isn't. */
  editHint?: 'readonly-source' | 'derived-view' | null
  /** Lazily fetch the subtree behind a depth-truncation marker. */
  expand: (path: NodePath) => Promise<unknown>
}>()

const emit = defineEmits<{
  rerun: []
  /** From the struct's value actions: replace the query with this jora path. */
  querySubquery: [path: string]
  /** From the struct's value actions: append this jora path to the query. */
  queryAppend: [path: string]
}>()

/** The node path an edit panel is open for (null = closed). */
const editingPath = shallowRef<NodePath | null>(null)

const containerEl = shallowRef<HTMLElement | null>(null)
const viewer = useDiscoveryViewer(containerEl, colorScheme, { view: 'struct', expanded: 2 }, {
  onQuerySubquery: path => emit('querySubquery', path),
  onQueryAppend: path => emit('queryAppend', path),
}, {
  onExpand: path => props.expand(path),
}, {
  enabled: () => props.canEdit ?? false,
  onEdit: path => (editingPath.value = path),
})

/** Deep enough to open every loaded level of a depth-capped result. */
const EXPAND_ALL_DEPTH = 100

watch(() => [props.result, props.canEdit] as const, ([value]) => {
  if (props.hasResult)
    void viewer.setData(prepareForDisplay(value, [], props.canEdit ?? false))
})

// Editing stops applying (source switch, query edit): close the panel.
watch(() => props.canEdit, (value) => {
  if (!value)
    editingPath.value = null
})

const lockTooltip = computed(() => {
  if (props.editHint === 'readonly-source')
    return 'Read-only source - register it with writable: true to edit values'
  if (props.editHint === 'derived-view')
    return 'Editing applies on the root view - clear the query (or run $) to edit'
  return ''
})

const copied = shallowRef(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
function copyResult(): void {
  try {
    void navigator.clipboard.writeText(JSON.stringify(props.result, null, 2))
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 1200)
  }
  catch {}
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="flex items-center gap-3 px-3 py-1.5 border-b border-base min-h-9 text-xs ws-nowrap color-muted font-mono tabular-nums flex-wrap" :class="{ 'op-fade': statsStale }">
      <template v-if="stats">
        <span class="flex items-center gap-1"><span class="op50">jora</span> <DisplayDuration :ms="stats.queryMs" colorize /></span>
        <div class="h-5 border-r border-base" />
        <span class="flex items-center gap-1"><span class="op50">norm</span> <DisplayDuration :ms="stats.normalize.ms" colorize /></span>
        <div class="h-5 border-r border-base" />
        <span class="flex items-center gap-1"><span class="op50">rpc</span> <DisplayDuration :ms="stats.rpcMs" colorize /></span>
        <div class="h-5 border-r border-base" />
        <span class="flex items-center gap-1"><DisplayBytes :bytes="stats.payloadBytes" colorize /></span>
        <div class="h-5 border-r border-base" />
        <span>{{ stats.normalize.nodes }} <span class="op50">nodes</span></span>
        <template v-if="stats.normalize.refs">
          <div class="h-5 border-r border-base" />
          <span>{{ stats.normalize.refs }} <span class="op50">refs</span></span>
        </template>
        <DisplayBadge v-if="stats.normalize.truncatedEntries || stats.normalize.truncatedDepth" :color="12" text="truncated" />
        <template v-if="lastRunAt">
          <div class="h-5 border-r border-base" />
          <span class="flex items-center gap-1"><DisplayDate :date="lastRunAt" live /></span>
        </template>
      </template>
      <span v-else class="op-fade select-none">no query run yet</span>
      <div class="flex-auto" />
      <span v-if="running" class="flex items-center gap-1.5 color-faint">
        <span class="i-ph:circle-notch animate-spin" />
        running
      </span>
      <span
        v-if="editHint"
        class="flex items-center color-faint"
        :title="lockTooltip"
      >
        <span :class="editHint === 'readonly-source' ? 'i-ph:lock-simple-duotone' : 'i-ph:pencil-simple-slash-duotone'" />
      </span>
      <ActionIconButton
        v-if="hasResult"
        class="text-sm"
        icon="i-ph:arrows-out-line-vertical"
        label="Expand all"
        tooltip="Expand all levels"
        @click="viewer.setExpanded(EXPAND_ALL_DEPTH)"
      />
      <ActionIconButton
        v-if="hasResult"
        class="text-sm"
        icon="i-ph:arrows-in-line-vertical"
        label="Collapse all"
        tooltip="Collapse to the top level"
        @click="viewer.setExpanded(1)"
      />
      <ActionIconButton
        v-if="hasResult"
        class="text-sm"
        :icon="copied ? 'i-ph:check' : 'i-ph:copy-duotone'"
        label="Copy result as JSON"
        tooltip="Copy the result as JSON"
        @click="copyResult"
      />
      <ActionIconButton
        class="text-sm"
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

    <div v-show="hasResult" class="flex-1 min-h-0 flex">
      <div ref="containerEl" class="di-result-host flex-1 min-w-0 min-h-0 overflow-auto" />
      <EditPanel
        v-if="editingPath && canEdit"
        :path="editingPath"
        @close="editingPath = null"
      />
    </div>
    <div v-if="!hasResult" class="flex-1 grid place-items-center select-none">
      <div class="flex flex-col items-center gap-2 color-faint">
        <span class="i-ph:tree-structure-duotone text-3xl" />
        <span class="text-sm">Results render here, start typing a query</span>
      </div>
    </div>
  </div>
</template>
