<script setup lang="ts">
import type { MessageFilters } from '../composables/useMessageFilters'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import LayoutSeparator from '@antfu/design/components/Layout/LayoutSeparator.vue'

const props = defineProps<{
  filters: MessageFilters
}>()

defineEmits<{
  /** Dismiss every entry matching the current filter. */
  dismissFiltered: []
  /** Dismiss all entries. */
  clear: []
}>()

const { filters } = props
</script>

<template>
  <ActionIconButton
    class="text-sm"
    :icon="filters.sortIcon"
    :tooltip="filters.sortLabel"
    label="Change sort order"
    @click="filters.cycleSortMode"
  />

  <DisplayBadge v-if="filters.totalCount > 0" :color="false" class="text-xs font-mono">
    <template v-if="filters.filteredCount !== filters.totalCount">
      {{ filters.filteredCount }}/{{ filters.totalCount }}
    </template>
    <template v-else>
      {{ filters.totalCount }}
    </template>
  </DisplayBadge>

  <template v-if="filters.hasActiveFilter">
    <ActionButton
      variant="text"
      size="sm"
      icon="i-ph:funnel-x-duotone"
      @click="filters.resetFilters"
    >
      Reset
    </ActionButton>
    <ActionButton
      v-if="filters.filteredCount > 0"
      variant="text"
      size="sm"
      icon="i-ph:trash-duotone"
      @click="$emit('dismissFiltered')"
    >
      Dismiss filtered
    </ActionButton>
  </template>
  <ActionButton
    v-else-if="filters.totalCount > 0"
    variant="text"
    size="sm"
    icon="i-ph:trash-duotone"
    @click="$emit('clear')"
  >
    Dismiss all
  </ActionButton>

  <LayoutSeparator orientation="vertical" class="!h-4" />
</template>
