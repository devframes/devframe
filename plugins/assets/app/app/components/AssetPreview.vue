<script setup lang="ts">
import type { AssetInfo } from '../connect'
import FontPreview from './FontPreview.vue'

defineProps<{
  asset: AssetInfo
  textContent?: string | null
  /**
   * Server-highlighted HTML for text assets (from the `@devframes/service-shiki`
   * wire service); the plain `textContent` `<pre>` is the fallback.
   */
  highlightedHtml?: string | null
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

  <!-- Shiki output is server-generated from server-read content over the
       trusted devframe RPC (shiki escapes the code itself), so direct
       injection matches the repo's handling of self-generated markup. -->
  <div
    v-else-if="asset.type === 'text' && highlightedHtml"
    class="asset-code-preview w-full items-start p-4"
    :class="BASE"
    v-html="highlightedHtml"
  />
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

<!-- Unscoped: `v-html` content is invisible to scoped styles. The dark rules
     are Shiki's standard dual-theme toggle (`--shiki-dark` variables). -->
<style>
.asset-code-preview pre {
  margin: 0;
  max-height: 10rem;
  width: 100%;
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1rem;
  background-color: transparent !important;
}
.dark .asset-code-preview .shiki,
.dark .asset-code-preview .shiki span {
  color: var(--shiki-dark) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
  text-decoration: var(--shiki-dark-text-decoration) !important;
}
</style>
