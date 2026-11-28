<script setup lang="ts">
import type { LegacyQueriesMode, SavedQueryScope } from '@devframes/plugin-data-inspector/engine'
import LayoutSplitPane from '@antfu/design/components/Layout/LayoutSplitPane.vue'
import { provideColorScheme } from '@antfu/design/composables/colorScheme'
import { Pane } from 'splitpanes'
import { onMounted, provide } from 'vue'
import AppHeader from './components/AppHeader.vue'
import DataSourcePanel from './components/DataSourcePanel.vue'
import QueryPanel from './components/QueryPanel.vue'
import ResultViewer from './components/ResultViewer.vue'
import SavedQueriesPanel from './components/SavedQueriesPanel.vue'
import { useLegacyQueries } from './composables/legacy-queries'
import { backend, connect, connection, onDockActivation } from './composables/rpc'
import { useSavedQueries } from './composables/saved'
import { colorScheme } from './composables/scheme'
import { useWorkbench, workbenchKey } from './composables/workbench'
import '@antfu/design/styles.css'

const wb = useWorkbench()
const savedApi = useSavedQueries()
const legacyApi = useLegacyQueries()

// The workbench is the app's shared context; panels inject it rather than
// receiving it (and mutating it) through props.
provide(workbenchKey, wb)

// The app owns the color scheme; feed it to @antfu/design's opt-in context so
// the JS-colored surfaces (hash/hue `DisplayBadge`) tune their contrast to the
// active mode without threading a `colorScheme` prop through every panel.
provideColorScheme(() => colorScheme.value)

onMounted(async () => {
  await connect()
  if (!connection.connected)
    return
  await Promise.all([
    wb.loadSources(),
    savedApi.refresh(),
    legacyApi.refresh(),
  ])
  // Sources registered/unregistered after boot refresh the picker live.
  backend().onSourcesChanged(() => void wb.loadSources())
  // Data changes (writes, server-side notifications) refresh the active view.
  backend().onDataChanged(sourceId => wb.handleDataChanged(sourceId))
  // In a hub, another dock can deep-link straight to a source via dock
  // activation (`hub:docks:activate` with `params.sourceId`); focus it.
  void onDockActivation('devframes:plugin:data-inspector', id => wb.focusSource(id))
  // An empty query runs `$`: the workbench lands on the full source object.
  void wb.runNow()
  void wb.loadSkeleton()
})

// Persisting a recipe spans both state holders: the editor's current query +
// filters (workbench) and the store it lands in (savedApi).
function saveCurrent(input: { title?: string, description?: string, scope: SavedQueryScope }): void {
  void savedApi.save({
    ...input,
    query: wb.query.value,
    excludeFunctions: wb.settings.excludeFunctions || undefined,
    excludeUnderscoreProps: wb.settings.excludeUnderscoreProps || undefined,
    excludeDollarProps: wb.settings.excludeDollarProps || undefined,
  })
}

// Resolving legacy records either lands them in the project store (refresh the
// list) or drops them; both leave the report smaller.
async function resolveLegacy(input: { ids: string[], mode: LegacyQueriesMode }): Promise<void> {
  await legacyApi.resolve(input.ids, input.mode)
  if (input.mode === 'claim')
    await savedApi.refresh()
}
</script>

<template>
  <div class="h-100dvh flex flex-col bg-base color-base font-sans">
    <main class="flex-1 min-h-0">
      <LayoutSplitPane storage-key="data-inspector-panes" class="h-full">
        <Pane :size="38" min-size="24" class="min-w-0">
          <div class="flex flex-col h-full overflow-hidden min-h-0">
            <AppHeader />
            <DataSourcePanel />
            <div class="flex-1 min-h-0 overflow-y-auto">
              <div class="min-h-full flex flex-col">
                <QueryPanel />
                <SavedQueriesPanel
                  :saved="savedApi.saved.value"
                  :suggested="wb.activeSource.value?.queries ?? []"
                  :current-query="wb.query.value"
                  :current-filters="wb.settings"
                  :readonly="connection.mode === 'static'"
                  :legacy="legacyApi.report.value.records"
                  class="px3 py2"
                  @load="wb.applyRecipe($event)"
                  @remove="savedApi.remove($event)"
                  @save="saveCurrent"
                  @legacy-resolve="resolveLegacy"
                />
              </div>
            </div>
          </div>
        </Pane>
        <Pane class="min-w-0">
          <ResultViewer
            :result="wb.result.value"
            :observation="wb.observation.value"
            :observation-notices="wb.observationNotices.value"
            :has-result="wb.hasResult.value"
            :stats="wb.stats.value"
            :stats-stale="wb.statsStale.value"
            :error="wb.serverError.value"
            :running="wb.running.value"
            :last-run-at="wb.lastRunAt.value"
            :can-edit="wb.canEdit.value"
            :edit-hint="wb.editHint.value"
            :expand="wb.expandNode"
            @rerun="wb.runNow()"
            @query-subquery="wb.applySubquery($event)"
            @query-append="wb.appendPath($event)"
          />
        </Pane>
      </LayoutSplitPane>
    </main>
  </div>
</template>
