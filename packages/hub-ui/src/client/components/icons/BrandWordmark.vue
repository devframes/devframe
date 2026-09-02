<script setup lang="ts">
import { useBranding, useBrandingLogo } from '../../state/branding'
import DevframeLogo from './DevframeLogo.vue'

// The wordmark - a consumer-supplied wordmark image, or the mark composed with
// the product name. A decorative flourish (e.g. peeking above the palette).
const branding = useBranding()
const wordmark = useBrandingLogo(b => b.wordmark)
const logo = useBrandingLogo(b => b.logo)
</script>

<template>
  <div class="flex items-center gap-1.5 select-none" aria-hidden="true">
    <img
      v-if="wordmark"
      :src="wordmark"
      :alt="branding.productName"
      class="h-6 flex-none object-contain"
      draggable="false"
    >
    <template v-else>
      <img
        v-if="logo"
        :src="logo"
        :alt="`${branding.productName} logo`"
        class="w-6 h-6 flex-none object-contain"
        draggable="false"
      >
      <DevframeLogo v-else class="w-6 h-6 flex-none" />
      <span class="text-xl font-bold tracking-tight color-base">{{ branding.productName }}</span>
    </template>
  </div>
</template>
