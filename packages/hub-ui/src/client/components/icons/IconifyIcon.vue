<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { getIconifySvg } from '../../utils/iconify'

const props = defineProps<{
  icon: string
}>()

const isUrlIcon = computed(() => props.icon.includes('/') || props.icon.startsWith('data:') || props.icon.startsWith('builtin:'))
const iconifyParsed = computed(() => {
  if (isUrlIcon.value)
    return undefined
  const match = props.icon.match(/^(?:i-)?([\w-]+):([\w-]+)$/)
  if (!match)
    return undefined
  return {
    collection: match[1]!,
    icon: match[2]!,
  }
})

const iconifyLoaded = ref<string | undefined>(undefined)
const failed = ref(false)
watchEffect(async (onCleanup) => {
  let active = true
  onCleanup(() => {
    active = false
  })
  iconifyLoaded.value = undefined
  failed.value = false
  if (!iconifyParsed.value)
    return
  try {
    const svg = await getIconifySvg(iconifyParsed.value.collection, iconifyParsed.value.icon)
    if (active)
      iconifyLoaded.value = svg
  }
  catch {
    if (active)
      failed.value = true
  }
})
</script>

<template>
  <svg v-if="failed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" class="w-full h-full">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M12 7v6m0 3v1" />
  </svg>
  <div
    v-else-if="iconifyParsed"
    aria-hidden="true"
    v-html="iconifyLoaded"
  />
  <img
    v-else :src="icon"
    class="w-full h-full m-auto"
    draggable="false"
  >
</template>
