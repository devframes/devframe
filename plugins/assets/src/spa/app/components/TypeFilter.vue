<script setup lang="ts">
import type { AssetType } from '../../../types'
import { TYPE_META } from '../utils/assetType'

interface TypeFilterItem {
  type: AssetType
  count: number
  checked: boolean
}

defineProps<{ items: TypeFilterItem[] }>()
const emit = defineEmits<{ toggle: [type: AssetType] }>()
</script>

<template>
  <!--
    Inline row of type-filter chips — one per asset type present. Modeled on
    vitejs/devtools' DataSearchPanel: a selected chip reads normally, an
    unselected one is greyed out. Always visible (no dropdown).
  -->
  <div v-if="items.length > 1" class="flex shrink-0 flex-wrap items-center gap-2 border-b border-base bg-secondary px-3 py-1.5">
    <button
      v-for="{ type, count, checked } in items"
      :key="type"
      type="button"
      :title="`${TYPE_META[type].label} (${count})`"
      :aria-pressed="checked"
      class="flex select-none items-center gap-1.5 rounded-md border border-base px-2 py-1 text-xs transition"
      :class="checked ? 'bg-active' : 'op50 grayscale hover:op-100'"
      @click="emit('toggle', type)"
    >
      <span :class="TYPE_META[type].icon" />
      <span>{{ TYPE_META[type].label }}</span>
      <span class="op-fade">{{ count }}</span>
    </button>
  </div>
</template>
