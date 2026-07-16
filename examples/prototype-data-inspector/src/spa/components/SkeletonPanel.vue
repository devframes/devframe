<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { shallowRef, watch } from 'vue'
import { useDiscoveryViewer } from '../composables/discovery'
import { colorScheme } from '../composables/scheme'

const props = defineProps<{
  /** The type skeleton of the active source (query-independent). */
  skeleton: unknown
  error: string | null
  loading: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

const containerEl = shallowRef<HTMLElement | null>(null)
const viewer = useDiscoveryViewer(containerEl, colorScheme, { view: 'struct', expanded: 3 })

watch(() => props.skeleton, (value) => {
  if (value !== undefined)
    void viewer.setData(value)
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="flex items-center gap-2 px-1 pb-1.5">
      <span class="text-xs font-medium color-muted uppercase tracking-wide select-none">Available data</span>
      <span class="text-xs color-faint select-none">shape only</span>
      <div class="flex-1" />
      <ActionIconButton
        size="sm"
        :icon="loading ? 'i-ph:arrows-clockwise animate-spin' : 'i-ph:arrows-clockwise'"
        label="Refresh skeleton"
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
    <div ref="containerEl" class="di-result-host flex-1 min-h-0 overflow-auto border border-base rounded-lg" />
  </div>
</template>
