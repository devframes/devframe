<script setup lang="ts">
import MessageTag from './MessageTag.vue'

defineProps<{
  label: string
  items: string[]
  active: Set<string>
  /** Map item key → { icon, color, label } for styled (level/source) items. */
  styles?: Record<string, { icon?: string, color?: string, label?: string }>
  /** Render items as hash-colored `MessageTag` chips of this kind (category/label). */
  tag?: 'category' | 'label'
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
        tag ? 'p-0.5' : 'px-1.5 py-0.5 gap-0.5 text-xs',
        !tag && !isDimmed(active, item) ? (styles?.[item]?.color || '') : '',
        isDimmed(active, item) ? 'op50 saturate-10 hover:op85 hover:saturate-50' : 'op85 hover:op100',
      ]"
      @click="$emit('toggle', item)"
    >
      <template v-if="tag">
        <MessageTag :text="item" :kind="tag" />
      </template>
      <template v-else>
        <div v-if="styles?.[item]?.icon" :class="styles[item]!.icon" class="w-3.5 h-3.5" />
        <span>{{ styles?.[item]?.label || item }}</span>
      </template>
    </button>
  </div>
</template>
