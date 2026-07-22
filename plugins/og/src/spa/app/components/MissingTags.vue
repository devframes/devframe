<script setup lang="ts">
import type { OgHeadTag } from '../../../types'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import LayoutTabs from '@antfu/design/components/Layout/LayoutTabs.vue'
import { computed, shallowRef } from 'vue'
import { createMissingTagSnippet, tagDefinitions } from '../utils/metadata'

const props = defineProps<{
  tags: OgHeadTag[]
}>()

type View = 'missing' | 'snippet'

const view = shallowRef<View>('missing')
const copied = shallowRef(false)
const tabs: { value: View, label: string }[] = [
  { value: 'missing', label: 'Missing tags' },
  { value: 'snippet', label: 'Nuxt snippet' },
]
const missing = computed(() => tagDefinitions.filter(definition => !props.tags.some(tag => tag.name === definition.name)))
const snippet = computed(() => createMissingTagSnippet(missing.value))

async function copySnippet(): Promise<void> {
  await navigator.clipboard.writeText(snippet.value)
  copied.value = true
  window.setTimeout(() => copied.value = false, 1500)
}
</script>

<template>
  <section v-if="missing.length" class="border border-base rounded-lg overflow-hidden bg-base">
    <header class="flex flex-wrap items-center gap-2 border-b border-base bg-secondary px3 py2">
      <span class="i-ph-warning-duotone color-warning" />
      <h2 class="m0 text-sm font-semibold">
        Suggestions
      </h2>
      <span class="color-muted text-xs">{{ missing.length }} missing</span>
      <LayoutTabs v-model="view" :tabs="tabs" variant="segment" class="ml-auto" />
    </header>

    <div v-if="view === 'missing'" class="divide-y divide-base">
      <div v-for="item in missing" :key="item.name" class="grid gap-1 px3 py2 md:grid-cols-[9rem_1fr_auto] md:items-center">
        <a v-if="item.docs" :href="item.docs" target="_blank" rel="noreferrer" class="font-mono text-xs color-active">
          {{ item.name }}
        </a>
        <span v-else class="font-mono text-xs color-active">{{ item.name }}</span>
        <span class="color-muted text-xs">{{ item.description }}</span>
        <span class="justify-self-start rounded bg-secondary px1.5 py0.5 color-muted text-2.5 md:justify-self-end">{{ item.suggestion }}</span>
      </div>
    </div>

    <div v-else class="relative p3">
      <pre class="m0 overflow-auto rounded bg-secondary p3 color-base font-mono text-xs leading-relaxed"><code>{{ snippet }}</code></pre>
      <ActionButton class="absolute right5 top5" size="sm" :icon="copied ? 'i-ph-check-duotone' : 'i-ph-copy-duotone'" @click="copySnippet">
        {{ copied ? 'Copied' : 'Copy' }}
      </ActionButton>
    </div>
  </section>
</template>
