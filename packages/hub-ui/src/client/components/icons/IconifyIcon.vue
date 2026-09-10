<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { getIconifySvg } from '../../utils/iconify'

const props = defineProps<{
  icon: string
}>()

const maskUrl = computed(() => props.icon.startsWith('mask:') ? props.icon.slice(5).trim() : undefined)
const isUrlIcon = computed(() => maskUrl.value !== undefined || props.icon.includes('/') || props.icon.startsWith('data:') || props.icon.startsWith('builtin:'))
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
watchEffect(async () => {
  if (!iconifyParsed.value) {
    iconifyLoaded.value = undefined
    return
  }
  try {
    iconifyLoaded.value = await getIconifySvg(iconifyParsed.value.collection, iconifyParsed.value.icon)
  }
  catch {
    // A failed icon fetch (offline / flaky CDN) should degrade to a blank icon,
    // not throw out of the async effect and crash the surrounding panel.
    iconifyLoaded.value = undefined
  }
})
</script>

<template>
  <div
    v-if="maskUrl !== undefined"
    aria-hidden="true"
    class="w-full h-full"
    :style="{ backgroundColor: 'currentColor', mask: `url(${JSON.stringify(maskUrl)}) center / contain no-repeat`, maskMode: 'alpha' }"
  />
  <div
    v-else-if="iconifyParsed"
    v-html="iconifyLoaded"
  />
  <img
    v-else :src="icon"
    class="w-full h-full m-auto"
    draggable="false"
  >
</template>
