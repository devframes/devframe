<script setup lang="ts">
import type { SocialCardData } from '../../utils/metadata'
import PreviewImage from './PreviewImage.vue'

defineProps<{
  card: SocialCardData
}>()
</script>

<template>
  <article class="w-full max-w-125 overflow-hidden border border-base rounded-sm bg-base shadow-sm">
    <PreviewImage :src="card.image" :alt="card.imageAlt" class="aspect-1.91/1 w-full" />
    <div class="p3">
      <h3 class="m0 truncate text-base font-semibold">
        {{ card.title || 'Untitled page' }}
      </h3>
      <div class="mt1 truncate color-muted text-xs">
        {{ card.hostname }}
      </div>
    </div>
  </article>
</template>
