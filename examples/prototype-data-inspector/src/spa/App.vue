<script setup lang="ts">
import type { SavedQuery, SavedQueryScope } from '../rpc-contract'
import ActionDarkToggle from '@antfu/design/components/Action/ActionDarkToggle.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import LayoutSplitPane from '@antfu/design/components/Layout/LayoutSplitPane.vue'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
import { Pane } from 'splitpanes'
import { computed, onMounted } from 'vue'
import QueryEditor from './components/QueryEditor.vue'
import ResultViewer from './components/ResultViewer.vue'
import SavedQueriesPanel from './components/SavedQueriesPanel.vue'
import { connect, connection } from './composables/rpc'
import { useSavedQueries } from './composables/saved'
import { colorScheme } from './composables/scheme'
import { useWorkbench } from './composables/workbench'

const wb = useWorkbench()
const savedApi = useSavedQueries()

const sourceOptions = computed(() =>
  wb.sources.value.map(s => ({ value: s.id, label: s.title })),
)

onMounted(async () => {
  await connect()
  if (!connection.connected)
    return
  await Promise.all([wb.loadSources(), savedApi.refresh()])
  // Land on a rendered result.
  if (!wb.query.value)
    wb.query.value = 'config.plugins.name'
})

function loadSaved(entry: SavedQuery): void {
  if (wb.sources.value.some(s => s.id === entry.sourceId))
    wb.sourceId.value = entry.sourceId
  wb.query.value = entry.query
  void wb.runNow()
}

function saveCurrent(input: { title: string, description?: string, scope: SavedQueryScope }): void {
  void savedApi.save({
    ...input,
    query: wb.query.value,
    sourceId: wb.sourceId.value,
  })
}
</script>

<template>
  <div class="h-100dvh flex flex-col bg-base color-base font-sans">
    <LayoutToolbar :glass="false">
      <div class="flex items-center gap-1.5 shrink-0 font-semibold text-sm select-none">
        <span class="i-ph:tree-structure-duotone text-base color-active" />
        <span>Data Inspector</span>
        <DisplayBadge text="prototype" :color="8" />
      </div>

      <div class="flex items-center gap-2">
        <FormSelect v-model="wb.sourceId.value" :options="sourceOptions" placeholder="Data source" />
        <DisplayBadge v-if="wb.activeSource.value?.static" text="static" :color="false" />
      </div>

      <template #end>
        <span
          class="flex items-center gap-1.5 text-xs color-muted select-none"
          :title="connection.error ?? undefined"
        >
          <span
            class="inline-block w-2 h-2 rounded-full"
            :class="connection.connected ? 'bg-green-600 dark:bg-green-400' : 'bg-red-600 dark:bg-red-400'"
          />
          {{ connection.status }}
        </span>
        <ActionDarkToggle
          :color-scheme="colorScheme"
          @update:color-scheme="colorScheme = $event"
        />
      </template>
    </LayoutToolbar>

    <main class="flex-1 min-h-0">
      <LayoutSplitPane storage-key="data-inspector-panes" class="h-full">
        <Pane :size="38" min-size="24" class="flex flex-col gap-3 p-3 min-w-0">
          <QueryEditor
            v-model="wb.query.value"
            :syntax="wb.syntax.value"
            :suggestions="wb.suggestions.value"
            class="flex-1 min-h-0"
            @run="wb.runNow()"
            @suggest="wb.scheduleSuggestions($event)"
            @accept="wb.acceptSuggestion($event)"
            @dismiss="wb.suggestions.value = []"
          />
          <SavedQueriesPanel
            :saved="savedApi.saved.value"
            :can-save="!!wb.query.value.trim()"
            class="max-h-45%"
            @load="loadSaved"
            @remove="savedApi.remove($event)"
            @save="saveCurrent"
          />
        </Pane>
        <Pane class="min-w-0">
          <ResultViewer
            :result="wb.result.value"
            :has-result="wb.hasResult.value"
            :stats="wb.stats.value"
            :stats-stale="wb.statsStale.value"
            :error="wb.serverError.value"
            :running="wb.running.value"
          />
        </Pane>
      </LayoutSplitPane>
    </main>
  </div>
</template>
