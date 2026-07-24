<script setup lang="ts">
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'

defineProps<{
  label: string
  items: string[]
  active: Set<string>
  /** Map item key → { icon, color, label } for styled (level/source) items. */
  styles?: Record<string, { icon?: string, color?: string, label?: string }>
  /** Render items as hash-colored `DisplayBadge` chips (category/label). */
  badge?: boolean
}>()

defineEmits<{
  toggle: [item: string]
}>()

function isDimmed(active: Set<string>, item: string): boolean {
  return active.size > 0 && !active.has(item)
}
</script>

<template>
  <span class="text-xs op-fade">{{ label }}</span>
  <div class="flex flex-wrap items-center gap-0.5">
    <button
      v-for="item of items"
      :key="item"
      type="button"
      class="rounded flex items-center transition"
      :class="[
        badge ? 'p-0.5' : 'px-1.5 py-0.5 gap-0.5 text-xs',
        !badge && !isDimmed(active, item) ? (styles?.[item]?.color || '') : '',
        isDimmed(active, item) ? 'op30 saturate-50' : '',
      ]"
      @click="$emit('toggle', item)"
    >
      <template v-if="badge">
        <DisplayBadge :text="item" class="text-xs" />
      </template>
      <template v-else>
        <div v-if="styles?.[item]?.icon" :class="styles[item]!.icon" class="w-3.5 h-3.5" />
        <span>{{ styles?.[item]?.label || item }}</span>
      </template>
    </button>
  </div>
</template>
