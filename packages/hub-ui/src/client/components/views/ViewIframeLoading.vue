<script setup lang="ts">
// Placeholder shown while an iframe view loads its content. A blank iframe
// paints white during load, so this is only visible once the pane steps aside
// (`pane.hide()` in `ViewIframe`) — the same layering trick `ViewAssetsError`
// relies on. It covers the initial load and any hard navigation/refresh.
</script>

<template>
  <div class="devframes-view-iframe-loading absolute inset-0 flex flex-col items-center justify-center gap-2 bg-base">
    <div class="i-ph:circle-notch-duotone animate-spin text-3xl color-faint" />
    <div class="text-sm color-muted">
      Loading…
    </div>
  </div>
</template>
