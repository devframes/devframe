<script setup lang="ts">
import { shallowRef, watch } from 'vue'

const props = defineProps<{
  src: string
  alt: string
  class?: string
}>()

const failed = shallowRef(false)
watch(() => props.src, () => failed.value = false)
</script>

<template>
  <img v-if="src && !failed" :src="src" :alt="alt" :class="$props.class" class="block bg-secondary object-cover img-outline" @error="failed = true">
  <div v-else :class="$props.class" class="flex items-center justify-center bg-secondary color-faint img-outline">
    <span class="i-ph-image-broken-duotone text-2xl" />
  </div>
</template>
