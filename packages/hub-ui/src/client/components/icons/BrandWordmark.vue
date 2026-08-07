<script setup lang="ts">
import DevframeLogo from './DevframeLogo.vue'
</script>

<template>
  <!-- The devframe wordmark — a decorative brand flourish (e.g. peeking
       above the command palette). -->
  <div class="flex items-center gap-1.5 select-none" aria-hidden="true">
    <DevframeLogo class="w-6 h-6 flex-none" />
    <span class="text-xl font-bold tracking-tight color-base">Devframes</span>
  </div>
</template>
