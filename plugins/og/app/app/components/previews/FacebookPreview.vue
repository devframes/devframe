<script setup lang="ts">
import type { SocialCardData } from '../../utils/metadata'
import PreviewImage from './PreviewImage.vue'

defineProps<{
  card: SocialCardData
}>()
</script>

<template>
  <article class="w-full max-w-125 bg-base">
    <PreviewImage :src="card.image" :alt="card.imageAlt" class="aspect-1.91/1 w-full" />
    <div class="border border-t-0 border-base bg-secondary px3 py2.5">
      <div class="truncate color-muted text-xs uppercase">
        {{ card.hostname }}
      </div>
      <h3 class="my1 truncate text-base font-semibold">
        {{ card.title || 'Untitled page' }}
      </h3>
      <p class="m0 truncate color-muted text-sm">
        {{ card.description || 'No description provided.' }}
      </p>
    </div>
  </article>
</template>
