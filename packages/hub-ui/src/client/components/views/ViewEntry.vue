<script setup lang="ts">
import type { DevframeDockEntry } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import type { IframePanes } from 'iframe-pane'
import type { CSSProperties } from 'vue'
import ViewBuiltinClientAuthNotice from '../views-builtin/ViewBuiltinClientAuthNotice.vue'
import ViewBuiltinSettings from '../views-builtin/ViewBuiltinSettings.vue'
import ViewCustomRenderer from './ViewCustomRenderer.vue'
import ViewDockRenderer from './ViewDockRenderer.vue'
import ViewIframe from './ViewIframe.vue'
import ViewLauncher from './ViewLauncher.vue'

defineProps<{
  context: DocksContext
  entry: DevframeDockEntry
  panes: IframePanes
  iframeStyle?: CSSProperties
  divStyle?: CSSProperties
}>()
</script>

<template>
  <Suspense>
    <template v-if="entry.type === '~builtin'">
      <ViewBuiltinSettings
        v-if="entry.id === '~settings'"
        :context
        :entry
      />
      <ViewBuiltinClientAuthNotice
        v-else-if="entry.id === '~client-auth-notice'"
        :context
      />
      <div v-else>
        Unknown builtin entry: {{ entry }}
      </div>
    </template>

    <!-- Entry for Actions -->
    <template v-else-if="entry.type === 'action'" />

    <!-- User-defined entries -->
    <ViewIframe
      v-else-if="entry.type === 'iframe'"
      :context
      :entry
      :panes="panes"
      :iframe-style="iframeStyle"
    />
    <ViewCustomRenderer
      v-else-if="entry.type === 'custom-render'"
      :context
      :entry
      :panes="panes"
      :div-style="divStyle"
    />
    <ViewLauncher
      v-else-if="entry.type === 'launcher'"
      :context
      :entry
    />
    <!--
      Any other dock type routes through the hub's dock-renderer registry
      (locally-registered renderers, or prebuilt modules from the hub's
      renderer manifest, e.g. `json-render`). With no renderer available it
      renders the missing-renderer fallback.
    -->
    <ViewDockRenderer
      v-else
      :context
      :entry
    />

    <template #fallback>
      <div>
        Loading...
      </div>
    </template>
  </Suspense>
</template>
