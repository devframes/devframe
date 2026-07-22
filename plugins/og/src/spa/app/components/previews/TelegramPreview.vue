<script setup lang="ts">
import type { SocialCardData } from '../../utils/metadata'
import PreviewImage from './PreviewImage.vue'

defineProps<{
  card: SocialCardData
}>()

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())
</script>

<template>
  <article class="w-full max-w-105 border border-base rounded-4 rounded-bl-sm bg-base p3 shadow-sm">
    <a :href="card.url" target="_blank" rel="noreferrer" class="block truncate color-active text-sm underline">{{ card.url }}</a>
    <div class="mt2 grid grid-cols-[2px_1fr] gap-2">
      <div class="rounded bg-primary op70" />
      <div class="min-w-0">
        <PreviewImage :src="card.image" :alt="card.imageAlt" class="mb2 aspect-1.91/1 w-full rounded" />
        <div class="color-active text-sm font-semibold">
          {{ card.hostname }}
        </div>
        <h3 class="my1 text-sm font-semibold">
          {{ card.title || 'Untitled page' }}
        </h3>
        <p class="m0 color-muted text-sm">
          {{ card.description || 'No description provided.' }}
        </p>
      </div>
    </div>
    <div class="mt1 text-right color-faint font-mono text-2.5 tabular-nums">
      {{ time }}
    </div>
  </article>
</template>
