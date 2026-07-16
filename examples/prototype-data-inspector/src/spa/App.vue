<script setup lang="ts">
import type { Query, SavedQueryScope } from '../rpc-contract'
import Button from '@antfu/design/components/Action/ActionButton.vue'
import ActionDarkToggle from '@antfu/design/components/Action/ActionDarkToggle.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
import LayoutSplitPane from '@antfu/design/components/Layout/LayoutSplitPane.vue'
import LayoutToolbar from '@antfu/design/components/Layout/LayoutToolbar.vue'
import { Pane } from 'splitpanes'
import { computed, onMounted } from 'vue'
import QueryEditor from './components/QueryEditor.vue'
import QuerySettings from './components/QuerySettings.vue'
import ResultViewer from './components/ResultViewer.vue'
import SavedQueriesPanel from './components/SavedQueriesPanel.vue'
import SkeletonPanel from './components/SkeletonPanel.vue'
import { connect, connection } from './composables/rpc'
import { useSavedQueries } from './composables/saved'
import { colorScheme } from './composables/scheme'
import { useWorkbench } from './composables/workbench'
import '@antfu/design/styles.css'

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
  // An empty query runs `$`: the workbench lands on the full source object.
  void wb.runNow()
  void wb.loadSkeleton()
})

// Queries are source-agnostic recipes: load applies the text AND the filter
// options it was authored with, against the currently selected source.
function loadRecipe(entry: Query): void {
  wb.applyRecipe(entry)
}

function saveCurrent(input: { title?: string, description?: string, scope: SavedQueryScope }): void {
  void savedApi.save({
    ...input,
    query: wb.query.value,
    excludeFunctions: wb.settings.excludeFunctions || undefined,
    excludeUnderscoreProps: wb.settings.excludeUnderscoreProps || undefined,
    excludeDollarProps: wb.settings.excludeDollarProps || undefined,
  })
}
</script>

<template>
  <div class="h-100dvh flex flex-col bg-base color-base font-sans">
    <LayoutToolbar :glass="false">
      <div class="flex items-center gap-1.5 shrink-0 font-semibold text-sm select-none">
        <span class="i-ph:tree-structure-duotone text-base color-active" />
        <span>Data Inspector</span>
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
        <Pane :size="38" min-size="24" class="min-w-0">
          <!-- The left column's sections resize with the same split-pane setup. -->
          <LayoutSplitPane horizontal storage-key="data-inspector-left-panes" class="h-full">
            <Pane :size="42" min-size="20" class="flex flex-col gap-2 p-3 pb-1.5 min-h-0">
              <div class="flex items-center gap-2 font-semibold text-sm select-none">
                <div>Jora Query</div>
                <a
                  href="https://discoveryjs.github.io/jora/"
                  target="_blank"
                  title="Jora query language reference"
                  class="flex items-center gap-1 color-muted hover:color-active"
                >
                  <span class="i-ph:question-duotone" />
                </a>
                <div class="flex-auto" />
                <Button
                  v-if="wb.query.value"
                  :disabled="!wb.query.value"
                  title="Clear query"
                  icon="i-ph:trash-duotone"
                  @click="wb.query.value = ''"
                >
                  <span>Clear</span>
                </Button>
                <Button
                  :disabled="wb.running.value"
                  :loading="wb.running.value"
                  title="Run query"
                  icon="i-ph:play-duotone"
                  @click="wb.runNow()"
                >
                  <span>Run</span>
                </Button>
              </div>
              <!-- TODO: Query draft should be persistent in local storage per data source, on switching data sources, it should be restored/reset -->
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
              <QuerySettings v-model="wb.settings" />
            </Pane>
            <Pane min-size="12" class="p-3 pt-1.5 min-h-0">
              <SavedQueriesPanel
                :saved="savedApi.saved.value"
                :suggested="wb.activeSource.value?.queries ?? []"
                :current-query="wb.query.value"
                :current-filters="wb.settings"
                class="h-full"
                @load="loadRecipe"
                @remove="savedApi.remove($event)"
                @save="saveCurrent"
              />
            </Pane>
            <Pane :size="33" min-size="12" class="p-3 py-1.5 min-h-0">
              <!-- TODO: this should be replaced with "DataSourceInfoPanel", that shows the data source title/description and simple data shape with one-level depth with normal code block (not discovery), on click the prop it would set the query -->
              <SkeletonPanel
                :skeleton="wb.skeleton.value"
                :error="wb.skeletonError.value"
                :loading="wb.skeletonLoading.value"
                @refresh="wb.loadSkeleton()"
              />
            </Pane>
          </LayoutSplitPane>
        </Pane>
        <Pane class="min-w-0">
          <ResultViewer
            :result="wb.result.value"
            :has-result="wb.hasResult.value"
            :stats="wb.stats.value"
            :stats-stale="wb.statsStale.value"
            :error="wb.serverError.value"
            :running="wb.running.value"
            @rerun="wb.runNow()"
          />
        </Pane>
      </LayoutSplitPane>
    </main>
  </div>
</template>
