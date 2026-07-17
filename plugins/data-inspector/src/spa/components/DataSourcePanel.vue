<script setup lang="ts">
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import { ref } from 'vue'
import { connection } from '../composables/rpc'
import { injectWorkbench } from '../composables/workbench'
import DataShapePanel from './DataShapePanel.vue'
import DataSourceSelect from './DataSourceSelect.vue'

const wb = injectWorkbench()

const showDetails = ref(false)
</script>

<template>
  <div class="px3 py2 border-b border-base flex flex-col gap-2 shrink-0">
    <div class="flex items-center gap-2">
      <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
        Data Source
      </div>
      <DataSourceSelect v-model="wb.sourceId.value" :sources="wb.sources.value" placeholder="Data source" />
      <div v-if="wb.activeSource.value?.description && !showDetails" class="text-xs op-fade ws-nowrap of-hidden shrink" :title="wb.activeSource.value?.description">
        {{ wb.activeSource.value?.description }}
      </div>
      <div class="flex-auto" />
      <ActionIconButton
        icon="i-ph:caret-down"
        class="transition flex-none text-sm"
        :class="{ 'rotate-180': showDetails }"
        :title="showDetails ? 'Hide details' : 'Show details'"
        @click="showDetails = !showDetails"
      />
    </div>

    <div v-if="connection.connected && !wb.sources.value.length" class="text-xs color-muted">
      No data sources registered yet. Call
      <code class="font-mono bg-secondary border border-base rounded px-1">registerDataSource()</code>
      from your plugin or host —
      <a
        href="https://devfra.me/plugins/data-inspector#providing-data-sources"
        target="_blank"
        class="color-active hover:underline"
      >see the docs</a>.
    </div>

    <DataShapePanel
      v-if="showDetails"
      :source="wb.activeSource.value"
      :skeleton="wb.skeleton.value"
      :error="wb.skeletonError.value"
      :loading="wb.skeletonLoading.value"
      @refresh="wb.loadSkeleton()"
      @select="wb.queryProp($event)"
    />
  </div>
</template>
