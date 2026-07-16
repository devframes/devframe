<script setup lang="ts">
import type { FilterOptions } from '../../rpc-contract'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'

const settings = defineModel<Required<FilterOptions>>({ required: true })
</script>

<template>
  <div class="flex items-center gap-4 flex-wrap px-1 text-sm">
    <span class="text-xs font-medium color-muted uppercase tracking-wide select-none">Filters</span>
    <FormCheckbox v-model="settings.excludeFunctions" label="Exclude functions" />
    <FormCheckbox v-model="settings.excludeUnderscoreProps" label="Exclude _ props" />
    <FormCheckbox v-model="settings.excludeDollarProps" label="Exclude $ props" />
  </div>
</template>
