<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  defaultOpen?: boolean
}>(), { defaultOpen: true })

const open = ref(props.defaultOpen)
</script>

<template>
  <!-- Collapsible folder-group header, mirroring Nuxt DevTools' NSectionBlock. -->
  <div class="border-b border-base last:border-b-0">
    <button
      type="button"
      class="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-active"
      @click="open = !open"
    >
      <span class="i-ph-caret-right transition" :class="open ? 'rotate-90' : ''" />
      <span class="text-sm font-mono">{{ title }}</span>
      <span v-if="description" class="op-fade text-xs">{{ description }}</span>
    </button>
    <div v-if="open" class="px-2 pb-2">
      <slot />
    </div>
  </div>
</template>
