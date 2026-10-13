<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'

defineProps<{
  loading: boolean
  isStatic: boolean
  /** The address takes a page path, resolved against the embedding page. */
  isEmbedded: boolean
  /** The final URL and HTTP status of the last inspected page. */
  url?: string
  status?: number
}>()

const emit = defineEmits<{
  inspect: []
  refresh: []
}>()

const target = defineModel<string>('target', { required: true })
</script>

<template>
  <LayoutToolbar :glass="false" class="h-nav">
    <div class="flex items-center gap-1.5 shrink-0 font-semibold text-sm select-none">
      <span class="i-ph-image-square-duotone text-base color-active" />
      <span>Open Graph</span>
      <span v-if="isStatic" class="rounded bg-secondary px1.5 py0.5 color-muted text-2.5 font-normal">static</span>
    </div>

    <template #search>
      <form class="mx-auto w-full max-w-3xl flex items-center gap-2" @submit.prevent="emit('inspect')">
        <label class="min-w-0 flex flex-1 items-center gap-2 border border-base rounded px3 py1.5 focus-within:border-active">
          <span class="i-ph-globe-hemisphere-west-duotone color-muted shrink-0" />
          <input
            v-model="target"
            class="min-w-0 flex-1 bg-transparent color-base font-mono text-xs outline-none"
            inputmode="url"
            :placeholder="isEmbedded ? '/' : 'http://localhost:3000'"
            spellcheck="false"
            :aria-label="isEmbedded ? 'Page path or URL' : 'Page URL'"
            :disabled="isStatic"
          >
        </label>
        <ActionIconButton
          icon="i-ph-arrow-clockwise-duotone"
          :tooltip="isEmbedded ? 'Refresh from the current page' : 'Refresh'"
          :disabled="isStatic || loading"
          compact
          @click="emit('refresh')"
        />
        <ActionButton variant="primary" :loading="loading" :disabled="isStatic" icon="i-ph-magnifying-glass-duotone" type="submit">
          Inspect
        </ActionButton>
      </form>
    </template>

    <template v-if="url" #end>
      <div class="max-w-80 flex items-center gap-2 color-muted text-xs">
        <span class="i-ph-check-circle-duotone shrink-0 color-status-positive" />
        <a :href="url" target="_blank" rel="noreferrer" class="min-w-0 truncate font-mono hover:color-active" :title="url">
          {{ url }}
        </a>
        <span class="shrink-0 font-mono tabular-nums">HTTP {{ status }}</span>
      </div>
    </template>
  </LayoutToolbar>
</template>
