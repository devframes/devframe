<script setup lang="ts">
import { computed } from 'vue'
import BrandMark from '../icons/BrandMark.vue'
import IconifyIcon from '../icons/IconifyIcon.vue'

const props = defineProps<{
  icon: string | { dark: string, light: string }
  title?: string
}>()

const icon = computed(() => {
  if (typeof props.icon === 'string') {
    return {
      dark: props.icon,
      light: props.icon,
    }
  }
  return props.icon
})
</script>

<template>
  <BrandMark v-if="icon.light === 'builtin:devframes'" />
  <div v-else class="flex items-center justify-center">
    <template v-if="icon.light === icon.dark">
      <IconifyIcon :icon="icon.light" :title="title" />
    </template>
    <template v-else>
      <IconifyIcon class="dark-hidden" :icon="icon.light" :title="title" />
      <IconifyIcon class="light-hidden" :icon="icon.dark" :title="title" />
    </template>
  </div>
</template>
