<script setup lang="ts">
import ContentSearch from '@nuxt/ui/components/content/ContentSearch.vue'

defineOptions({ inheritAttrs: false })
</script>

<template>
  <ContentSearch
    v-bind="$attrs"
    preserve-group-order
  />
</template>
