<script setup lang="ts">
import { onMounted } from 'vue'
import MetadataTable from './components/MetadataTable.vue'
import MissingTags from './components/MissingTags.vue'
import SocialPreview from './components/SocialPreview.vue'
import ViewerToolbar from './components/ViewerToolbar.vue'
import { useOgViewer } from './composables/useOgViewer'
import 'virtual:uno.css'
import '@antfu/design/styles.css'
import './assets/main.css'

const viewer = useOgViewer()

onMounted(() => viewer.inspect())
</script>

<template>
  <div class="h-100dvh flex flex-col bg-base color-base font-sans">
    <ViewerToolbar
      v-model:target="viewer.target.value"
      :loading="viewer.loading.value"
      :is-static="viewer.isStatic.value"
      @inspect="viewer.inspect()"
    />

    <div v-if="viewer.error.value" class="flex items-start gap-2 border-b border-base bg-red/8 px4 py2 color-red text-xs">
      <span class="i-ph-warning-octagon-duotone mt0.5 shrink-0" />
      <span>{{ viewer.error.value }}</span>
    </div>

    <main class="min-h-0 flex-1 overflow-auto">
      <div v-if="viewer.loading.value && !viewer.snapshot.value" class="h-full flex flex-col items-center justify-center gap-3 color-muted">
        <span class="i-ph-circle-notch-duotone animate-spin text-3xl color-active" />
        <span class="text-sm">Reading page metadata...</span>
      </div>

      <div v-else-if="!viewer.snapshot.value?.url" class="h-full flex flex-col items-center justify-center gap-3 px6 text-center color-muted">
        <span class="i-ph-image-square-duotone text-4xl color-active op70" />
        <div>
          <h1 class="m0 color-base text-base font-semibold">
            Inspect a social card
          </h1>
          <p class="mb0 mt1 max-w-100 text-sm">
            Enter a page URL to resolve its Open Graph and Twitter metadata.
          </p>
        </div>
      </div>

      <div v-else class="grid min-h-full gap4 p4 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,0.85fr)]">
        <div class="min-w-0 flex flex-col gap4">
          <div class="flex flex-wrap items-center gap-2 color-muted text-xs">
            <span class="i-ph-check-circle-duotone color-active" />
            <a :href="viewer.snapshot.value.url" target="_blank" rel="noreferrer" class="min-w-0 truncate font-mono hover:color-active" :title="viewer.snapshot.value.url">
              {{ viewer.snapshot.value.url }}
            </a>
            <span class="ml-auto font-mono tabular-nums">HTTP {{ viewer.snapshot.value.status }}</span>
          </div>
          <MetadataTable :tags="viewer.snapshot.value.tags" />
          <MissingTags :tags="viewer.snapshot.value.tags" />
        </div>
        <div class="min-w-0 xl:sticky xl:top4 xl:h-[calc(100dvh-6.5rem)]">
          <SocialPreview :snapshot="viewer.snapshot.value" />
        </div>
      </div>
    </main>
  </div>
</template>
