<script setup lang="ts">
import type { OgHeadTag } from '../../../types'
import { tagDefinitions } from '../utils/metadata'

defineProps<{
  tags: OgHeadTag[]
}>()

const docs = new Map(tagDefinitions.map(item => [item.name, item.docs]))

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}
</script>

<template>
  <section class="border border-base rounded-lg overflow-hidden bg-base">
    <header class="flex items-center gap-2 border-b border-base bg-secondary px3 py2">
      <span class="i-ph-tag-duotone color-active" />
      <h2 class="m0 text-sm font-semibold">
        Head metadata
      </h2>
      <span class="ml-auto color-muted font-mono text-xs tabular-nums">{{ tags.length }}</span>
    </header>
    <div v-if="tags.length" class="divide-y divide-base">
      <div v-for="(tag, index) in tags" :key="`${tag.tag}:${tag.name}:${index}`" class="grid grid-cols-[minmax(8rem,0.35fr)_1fr] items-start gap-3 px3 py2 hover:bg-active">
        <a
          v-if="docs.get(tag.name)"
          :href="docs.get(tag.name)"
          target="_blank"
          rel="noreferrer"
          class="min-w-0 truncate color-muted font-mono text-xs hover:color-active"
        >
          {{ tag.name }}
        </a>
        <span v-else class="min-w-0 truncate color-muted font-mono text-xs">{{ tag.name }}</span>
        <a
          v-if="isUrl(tag.value)"
          :href="tag.value"
          target="_blank"
          rel="noreferrer"
          class="min-w-0 break-all color-base font-mono text-xs hover:color-active"
        >
          {{ tag.value }}
        </a>
        <span v-else class="min-w-0 break-words color-base text-xs">{{ tag.value }}</span>
      </div>
    </div>
    <div v-else class="px4 py8 text-center color-muted text-sm">
      No supported head metadata was found.
    </div>
  </section>
</template>
