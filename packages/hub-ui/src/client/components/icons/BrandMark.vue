<script setup lang="ts">
import { useBranding, useBrandingLogo } from '../../state/branding'
import DevframeLogo from './DevframeLogo.vue'

// The brand mark - the consumer's branding logo (per color scheme) when set,
// otherwise devframe's default mark. Sized by the caller's classes.
const branding = useBranding()
const logo = useBrandingLogo(b => b.logo)
</script>

<template>
  <div class="flex items-center justify-center">
    <img
      v-if="logo"
      :src="logo"
      :alt="`${branding.productName} logo`"
      class="w-full h-full object-contain"
      draggable="false"
    >
    <DevframeLogo v-else class="w-full h-full" />
  </div>
</template>
