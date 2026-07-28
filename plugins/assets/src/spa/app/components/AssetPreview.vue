<script setup lang="ts">
import type { AssetInfo } from '../../../types'
import FontPreview from './FontPreview.vue'

defineProps<{
  asset: AssetInfo
  textContent?: string | null
  /** Larger, interactive preview (autoplay/controls) for the details panel. */
  detail?: boolean
}>()

const BASE = 'flex items-center justify-center overflow-hidden bg-active p-1'
</script>

<template>
  <div v-if="asset.type === 'image'" :class="BASE">
    <img :src="asset.publicPath" :alt="asset.path" class="max-h-full max-w-full select-none object-contain" :draggable="false">
  </div>

  <div v-else-if="asset.type === 'font'" :class="BASE">
    <FontPreview :asset="asset" class="self-stretch p-2 text-2xl" />
  </div>

  <div v-else-if="asset.type === 'text' && textContent" class="w-full items-start p-4" :class="BASE">
    <pre class="max-h-40 w-full overflow-hidden text-xs font-mono">{{ textContent }}</pre>
  </div>
  <div v-else-if="asset.type === 'text'" :class="BASE">
    <span class="i-ph-file-text-duotone text-3xl op-mute" />
  </div>

  <div v-else-if="asset.type === 'video'" :class="BASE">
    <video :src="asset.publicPath" :autoplay="detail" :controls="detail" class="max-h-full max-w-full" />
  </div>

  <div v-else-if="asset.type === 'audio'" :class="BASE">
    <audio v-if="detail" :src="asset.publicPath" controls />
    <span v-else class="i-ph-speaker-high-duotone text-3xl op-mute" />
  </div>

  <div v-else :class="BASE">
    <span class="i-ph-file-duotone text-3xl op-mute" />
  </div>
</template>
