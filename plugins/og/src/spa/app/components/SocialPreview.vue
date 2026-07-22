<script setup lang="ts">
import type { OgSnapshot } from '../../../types'
import LayoutTabs from '@antfu/design/components/Layout/LayoutTabs.vue'
import { computed, shallowRef } from 'vue'
import { toSocialCard } from '../utils/metadata'
import FacebookPreview from './previews/FacebookPreview.vue'
import LinkedinPreview from './previews/LinkedinPreview.vue'
import TelegramPreview from './previews/TelegramPreview.vue'
import TwitterPreview from './previews/TwitterPreview.vue'

const props = defineProps<{
  snapshot: OgSnapshot
}>()

type Network = 'facebook' | 'linkedin' | 'telegram' | 'twitter'

const network = shallowRef<Network>('twitter')
const card = computed(() => toSocialCard(props.snapshot, network.value === 'twitter'))
const tabs: { value: Network, label: string }[] = [
  { value: 'twitter', label: 'Twitter' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'telegram', label: 'Telegram' },
]
</script>

<template>
  <section class="h-full min-h-100 flex flex-col border border-base rounded-lg overflow-hidden bg-base">
    <header class="flex flex-wrap items-center gap-2 border-b border-base bg-secondary px3 py2">
      <span class="i-ph-share-network-duotone color-active" />
      <h2 class="m0 text-sm font-semibold">
        Social preview
      </h2>
      <LayoutTabs v-model="network" :tabs="tabs" variant="segment" class="ml-auto" />
    </header>
    <div class="preview-grid flex flex-1 items-center justify-center overflow-auto p5">
      <TwitterPreview v-if="network === 'twitter'" :card="card" />
      <FacebookPreview v-else-if="network === 'facebook'" :card="card" />
      <LinkedinPreview v-else-if="network === 'linkedin'" :card="card" />
      <TelegramPreview v-else :card="card" />
    </div>
  </section>
</template>
