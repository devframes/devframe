<script setup lang="ts">
import type { QuerySettings } from '../../rpc-contract'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'

const settings = defineModel<Required<QuerySettings>>({ required: true })
</script>

<template>
  <div class="flex items-center gap-4 flex-wrap px-1 text-sm">
    <span class="text-xs font-medium color-muted uppercase tracking-wide select-none">Settings</span>
    <FormCheckbox v-model="settings.ignoreFunctions" label="Ignore functions" />
    <FormCheckbox v-model="settings.ignoreUnderscorePrefixed" label="Ignore _ prefixed" />
    <FormCheckbox v-model="settings.ignoreDollarPrefixed" label="Ignore $ prefixed" />
  </div>
</template>
