<script setup lang="ts">
import type { FilterOptions } from '../../engine'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'

const settings = defineModel<Required<FilterOptions>>({ required: true })
const autoRun = defineModel<boolean>('autoRun', { default: false })
const autoRunSeconds = defineModel<number>('autoRunSeconds', { default: 5 })
</script>

<template>
  <div class="flex flex-col gap-2 text-sm">
    <div class="flex items-center gap-4 flex-wrap">
      <span class="text-xs font-medium color-muted uppercase tracking-wide select-none">Filters</span>
      <FormCheckbox v-model="settings.excludeFunctions" label="Exclude functions" />
      <FormCheckbox v-model="settings.excludeUnderscoreProps" label="Exclude _ props" />
      <FormCheckbox v-model="settings.excludeDollarProps" label="Exclude $ props" />
    </div>
    <div class="flex items-center gap-2 select-none color-base">
      <FormCheckbox v-model="autoRun" label="Auto rerun every" />
      <input
        v-model.number="autoRunSeconds"
        type="number"
        min="1"
        max="3600"
        :disabled="!autoRun"
        class="w-14 px-1.5 py-0.5 text-center rounded border border-base bg-secondary font-mono text-xs tabular-nums disabled:op-fade focus:border-primary-600/50 dark:focus:border-primary-400/50 outline-none"
        aria-label="Auto rerun interval in seconds"
      >
      <span class="text-xs" :class="autoRun ? 'color-muted' : 'color-faint'">seconds</span>
    </div>
  </div>
</template>
