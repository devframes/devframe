<script setup lang="ts">
import type { AssetInfo } from '@devframes/plugin-assets/client-script'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import AssetPreview from './AssetPreview.vue'

defineProps<{
  asset: AssetInfo
  label: string
  selectable?: boolean
  isSelected?: boolean
}>()

const emit = defineEmits<{
  select: []
  selectToggle: [path: string]
}>()
</script>

<template>
  <div
    class="relative flex cursor-pointer flex-col items-center gap-1 overflow-hidden rounded p-2 hover:bg-active"
    role="button"
    tabindex="0"
    @click="emit('select')"
    @keydown.enter="emit('select')"
  >
    <span v-if="selectable" class="absolute left-1 top-1 z-1" @click.stop>
      <FormCheckbox :model-value="isSelected" @update:model-value="emit('selectToggle', asset.path)" />
    </span>
    <AssetPreview :asset="asset" class="h-30 w-30 rounded border border-base" />
    <div class="w-full truncate whitespace-nowrap text-center text-xs">
      {{ label }}
    </div>
  </div>
</template>
