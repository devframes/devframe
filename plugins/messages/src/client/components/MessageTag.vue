<script setup lang="ts">
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'

// A hash-colored chip for an entry's category/label, distinguished by kind so
// the two read apart at a glance: a `category` keeps a thicker left border,
// a `label` renders as a rounded pill.
defineProps<{
  text: string
  kind: 'category' | 'label'
  /** Render as another element (e.g. `button` for a clickable filter chip). */
  as?: string
}>()
</script>

<template>
  <DisplayBadge
    :text="text"
    :as="as"
    :rounded="kind === 'label' ? 'full' : 'md'"
    class="text-xs"
    :class="kind === 'category' ? 'border-l-2!' : ''"
  />
</template>
