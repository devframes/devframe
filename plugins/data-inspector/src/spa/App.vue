<script setup lang="ts">
import type { Query, SavedQueryScope } from '../engine'
import Button from '@antfu/design/components/Action/ActionButton.vue'
import ActionDarkToggle from '@antfu/design/components/Action/ActionDarkToggle.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import LayoutSplitPane from '@antfu/design/components/Layout/LayoutSplitPane.vue'
import { Pane } from 'splitpanes'
import { onMounted, ref } from 'vue'
import DataShapePanel from './components/DataShapePanel.vue'
import DataSourceSelect from './components/DataSourceSelect.vue'
import QueryEditor from './components/QueryEditor.vue'
import QuerySettings from './components/QuerySettings.vue'
import ResultViewer from './components/ResultViewer.vue'
import SavedQueriesPanel from './components/SavedQueriesPanel.vue'
import { backend, connect, connection } from './composables/rpc'
import { useSavedQueries } from './composables/saved'
import { colorScheme } from './composables/scheme'
import { useWorkbench } from './composables/workbench'
import '@antfu/design/styles.css'

const wb = useWorkbench()
const savedApi = useSavedQueries()

const showDataSourceDetails = ref(false)

onMounted(async () => {
  await connect()
  if (!connection.connected)
    return
  await Promise.all([wb.loadSources(), savedApi.refresh()])
  // Sources registered/unregistered after boot refresh the picker live.
  backend().onSourcesChanged(() => void wb.loadSources())
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

/** A prop clicked in the data-shape panel becomes the query. */
function queryProp(key: string): void {
  wb.query.value = /^[a-z_$][\w$]*$/i.test(key) ? key : `$["${key.replaceAll('"', '\\"')}"]`
  void wb.runNow()
}

/** "Create a subquery from the path": pipe the path onto the current query. */
function querySubquery(path: string): void {
  const current = wb.query.value.trim()
  wb.query.value = current && current !== '$' ? `${current}\n| ${path}` : path
  void wb.runNow()
}

/** "Append path to current query": plain textual append. */
function queryAppend(path: string): void {
  const current = wb.query.value.trim()
  wb.query.value = current ? `${current}${path.startsWith('[') ? '' : '.'}${path}` : path
  void wb.runNow()
}
</script>

<template>
  <div class="h-100dvh flex flex-col bg-base color-base font-sans">
    <main class="flex-1 min-h-0">
      <LayoutSplitPane storage-key="data-inspector-panes" class="h-full">
        <Pane :size="38" min-size="24" class="min-w-0">
          <div class="flex flex-col h-full overflow-hidden min-h-0">
            <div class="flex items-center gap-1.5 shrink-0 select-none border-b border-base py1 px3">
              <span class="i-ph-crosshair-duotone text-base  color-primary" />
              <span class="color-primary font-semibold">Data Inspector</span>
              <span class="op-fade text-xs">Inspect server side data/objects interactively</span>
              <DisplayBadge
                v-if="connection.mode === 'static'"
                class="flex items-center gap-1.5 py-1 text-xs select-none"
                text="static"
                :color="false"
              />
              <DisplayBadge
                v-else-if="connection.status !== 'connected'"
                class="flex items-center gap-1.5 py-1 text-xs select-none capitalize"
                :title="connection.error ?? undefined"
                :text="connection.status"
                :color="connection.connected ? 100 : 200"
              />
              <div class="flex-auto" />
              <a
                href="https://devfra.me/plugins/data-inspector"
                target="_blank"
                title="Data Inspector docs — using the plugin and providing data sources"
                class="flex items-center gap-1 text-xs color-muted hover:color-active"
              >
                <span class="i-ph:book-open-duotone text-base" />
                <span>Docs</span>
              </a>
              <ActionDarkToggle
                :color-scheme="colorScheme"
                @update:color-scheme="colorScheme = $event"
              />
            </div>

            <div class="px3 py2 border-b border-base flex flex-col gap-2 shrink-0">
              <div class="flex items-center gap-2">
                <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
                  Data Source
                </div>
                <DataSourceSelect v-model="wb.sourceId.value" :sources="wb.sources.value" placeholder="Data source" />
                <div v-if="wb.activeSource.value?.description && !showDataSourceDetails" class="text-xs op-fade ws-nowrap of-hidden shrink" :title="wb.activeSource.value?.description">
                  {{ wb.activeSource.value?.description }}
                </div>
                <div class="flex-auto" />
                <Button
                  size="sm"
                  :icon="showDataSourceDetails ? 'i-ph:eye-slash-duotone' : 'i-ph:eye-duotone'"
                  @click="showDataSourceDetails = !showDataSourceDetails"
                >
                  <span>{{ showDataSourceDetails ? 'Hide' : 'Show' }} details</span>
                </Button>
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

              <template v-if="showDataSourceDetails">
                <DataShapePanel
                  :source="wb.activeSource.value"
                  :skeleton="wb.skeleton.value"
                  :error="wb.skeletonError.value"
                  :loading="wb.skeletonLoading.value"
                  @refresh="wb.loadSkeleton()"
                  @select="queryProp"
                />
              </template>
            </div>

            <div class="border-b border-base flex-auto flex-col flex">
              <div class="flex px3 py2 items-center gap-2 select-none ">
                <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
                  Jora Query
                </div>
                <a
                  href="https://discoveryjs.github.io/jora/#article:jora-syntax"
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
                  class="text-sm"
                  title="Clear query"
                  icon="i-ph:trash-duotone"
                  @click="wb.query.value = ''"
                >
                  <span>Clear</span>
                </Button>
                <Button
                  :disabled="wb.running.value"
                  :loading="wb.running.value"
                  class="text-sm"
                  title="Run query"
                  icon="i-ph:play-duotone"
                  @click="wb.runNow()"
                >
                  <span>Run</span>
                </Button>
              </div>
              <QueryEditor
                v-model="wb.query.value"
                :syntax="wb.syntax.value"
                :suggestions="wb.suggestions.value"
                class="flex-1 min-h-0 mx2"
                @run="wb.runNow()"
                @suggest="wb.scheduleSuggestions($event)"
                @accept="wb.acceptSuggestion($event)"
                @dismiss="wb.suggestions.value = []"
              />
              <QuerySettings v-model="wb.settings" class="py2 px4" />
            </div>
            <SavedQueriesPanel
              :saved="savedApi.saved.value"
              :suggested="wb.activeSource.value?.queries ?? []"
              :current-query="wb.query.value"
              :current-filters="wb.settings"
              :readonly="connection.mode === 'static'"
              class="px3 py2"
              @load="loadRecipe"
              @remove="savedApi.remove($event)"
              @save="saveCurrent"
            />
          </div>
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
            @query-subquery="querySubquery"
            @query-append="queryAppend"
          />
        </Pane>
      </LayoutSplitPane>
    </main>
  </div>
</template>
