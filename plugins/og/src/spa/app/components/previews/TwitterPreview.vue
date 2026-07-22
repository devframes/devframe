<script setup lang="ts">
import type { SocialCardData } from '../../utils/metadata'
import PreviewImage from './PreviewImage.vue'

defineProps<{
  card: SocialCardData
}>()
</script>

<template>
  <article v-if="card.twitterCard !== 'summary'" class="w-full max-w-110 overflow-hidden border border-base rounded-4 bg-base">
    <PreviewImage :src="card.image" :alt="card.imageAlt" class="aspect-2/1 w-full" />
    <div class="p3">
      <div class="truncate color-muted text-xs lowercase">
        {{ card.hostname }}
      </div>
      <h3 class="my1 truncate text-sm font-semibold">
        {{ card.title || 'Untitled page' }}
      </h3>
      <p class="m0 line-clamp-2 color-muted text-sm">
        {{ card.description || 'No description provided.' }}
      </p>
    </div>
  </article>
  <article v-else class="w-full max-w-110 flex overflow-hidden border border-base rounded-4 bg-base">
    <PreviewImage :src="card.image" :alt="card.imageAlt" class="aspect-square w-32 shrink-0" />
    <div class="min-w-0 flex flex-col justify-center p3">
      <div class="truncate color-muted text-xs lowercase">
        {{ card.hostname }}
      </div>
      <h3 class="my1 truncate text-sm font-semibold">
        {{ card.title || 'Untitled page' }}
      </h3>
      <p class="m0 line-clamp-2 color-muted text-sm">
        {{ card.description || 'No description provided.' }}
      </p>
    </div>
  </article>
</template>
