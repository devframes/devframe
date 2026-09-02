<script setup lang="ts">
// Placeholder shown while an iframe view loads its content. The pane steps
// aside while loading so this inherits the viewer's configured background.
</script>

<template>
  <div class="devframes-view-iframe-loading absolute inset-0 flex flex-col items-center justify-center gap-2">
    <div class="i-ph:circle-notch-duotone animate-spin text-3xl color-faint" />
    <div class="text-sm color-muted">
      Loading…
    </div>
  </div>
</template>
