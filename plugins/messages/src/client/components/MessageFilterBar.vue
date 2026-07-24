<script setup lang="ts">
import type { DevframeMessageEntryFrom } from '@devframes/hub/types'
import type { MessageFilters } from '../composables/useMessageFilters'
import LayoutSeparator from '@antfu/design/components/Layout/LayoutSeparator.vue'
import FilterToggles from './FilterToggles.vue'
import { fromEntries, levels } from './message-styles'

const props = defineProps<{
  filters: MessageFilters
}>()

const { filters } = props
</script>

<template>
  <div class="border-base border-b px-3 py-2 flex flex-wrap items-center gap-1">
    <FilterToggles
      label="Level"
      :items="filters.allLevels"
      :active="(filters.activeLevels as Set<string>)"
      :styles="levels"
      @toggle="filters.toggleLevel"
    />

    <LayoutSeparator orientation="vertical" class="!h-4" />

    <FilterToggles
      label="From"
      :items="filters.allSources"
      :active="(filters.activeSources as Set<string>)"
      :styles="fromEntries"
      @toggle="(item) => filters.toggleSource(item as DevframeMessageEntryFrom)"
    />

    <template v-if="filters.allCategories.length > 0">
      <LayoutSeparator orientation="vertical" class="!h-4" />
      <FilterToggles
        label="Category"
        :items="filters.allCategories"
        :active="(filters.activeCategories as Set<string>)"
        badge
        @toggle="filters.toggleCategory"
      />
    </template>

    <template v-if="filters.allLabels.length > 0">
      <LayoutSeparator orientation="vertical" class="!h-4" />
      <FilterToggles
        label="Labels"
        :items="filters.allLabels"
        :active="(filters.activeLabels as Set<string>)"
        badge
        @toggle="filters.toggleLabel"
      />
    </template>
  </div>
</template>
