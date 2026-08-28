<script setup lang="ts">
withDefaults(defineProps<{
  author?: string
  handle?: string
  href?: string
}>(), {
  author: 'Anthony Fu',
  handle: '@antfu',
  href: 'https://github.com/antfu',
})
</script>

<template>
  <a
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    class="not-prose mt-6 inline-flex items-center gap-3 rounded-lg text-inherit no-underline transition-opacity hover:opacity-80"
  >
    <img
      src="https://github.com/antfu.png?size=96"
      :alt="author"
      class="size-11 rounded-full bg-elevated object-cover"
    >
    <span>
      <span class="block text-sm font-semibold text-highlighted">{{ author }}</span>
      <span class="block text-sm text-muted">{{ handle }}</span>
    </span>
  </a>
</template>
