<script setup lang="ts">
import type { DataSourceMeta } from '../../engine'
import { SelectContent, SelectIcon, SelectItem, SelectItemIndicator, SelectPortal, SelectRoot, SelectTrigger, SelectViewport } from 'reka-ui'
import { computed } from 'vue'

const props = defineProps<{
  sources: DataSourceMeta[]
  placeholder?: string
}>()

const model = defineModel<string>()

/** Fallback icon when a source doesn't declare one. */
const FALLBACK_ICON = 'i-ph:database-duotone'

const active = computed(() => props.sources.find(s => s.id === model.value))

function iconOf(source: DataSourceMeta | undefined): string {
  return source?.icon || FALLBACK_ICON
}
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger
      class="text-sm px-2.5 outline-none border border-base rounded bg-base inline-flex gap-2 h-9 min-w-52 max-w-80 transition items-center justify-between data-[disabled]:op50 focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <span class="inline-flex items-center gap-2 min-w-0">
        <!-- TODO: migrate to IconifyIcon.vue in @antfu/design 0.3 -->
        <span class="shrink-0 color-active" :class="iconOf(active)" aria-hidden="true" />
        <span class="truncate font-semibold text-primary">{{ active?.title ?? placeholder ?? 'Data source' }}</span>
      </span>
      <SelectIcon class="op-fade shrink-0">
        <span class="i-ph:caret-down" aria-hidden="true" />
      </SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="6"
        class="border border-base rounded-lg bg-base min-w-[--reka-select-trigger-width] max-w-100 shadow-lg z-dropdown overflow-hidden"
      >
        <SelectViewport class="p-1">
          <SelectItem
            v-for="source in sources"
            :key="source.id"
            :value="source.id"
            class="text-sm color-base py-1.5 pl-2 pr-2 outline-none rounded-md flex gap-2 cursor-pointer select-none transition items-start relative data-[highlighted]:bg-active"
          >
            <!-- TODO: migrate to IconifyIcon.vue in @antfu/design 0.3 -->
            <span class="shrink-0 mt-0.5 color-active" :class="iconOf(source)" aria-hidden="true" />
            <span class="flex flex-col min-w-0 flex-1">
              <span class="flex items-center gap-1.5">
                <span class="truncate font-medium">{{ source.title }}</span>
                <span v-if="source.static" class="shrink-0 text-10px op-fade border border-base rounded px-1">static</span>
              </span>
              <span v-if="source.description" class="text-11px color-faint truncate">{{ source.description }}</span>
            </span>
            <SelectItemIndicator class="color-active inline-flex items-center shrink-0 mt-0.5">
              <span class="i-ph:check" aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
