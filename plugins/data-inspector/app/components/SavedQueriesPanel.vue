<script setup lang="ts">
import type { FilterOptions, LegacyQueriesMode, Query, SavedQuery, SavedQueryScope } from '@devframes/plugin-data-inspector/engine'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import ActionToggleGroup from '@antfu/design/components/Action/ActionToggleGroup.vue'
import FormCheckbox from '@antfu/design/components/Form/FormCheckbox.vue'
import FormTextInput from '@antfu/design/components/Form/FormTextInput.vue'
import OverlayModal from '@antfu/design/components/Overlay/OverlayModal.vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  saved: SavedQuery[]
  /** Suggested queries provided by the active data source (read-only). */
  suggested: Query[]
  /** The current editor state, captured when the dialog saves. */
  currentQuery: string
  currentFilters: Required<FilterOptions>
  /** Static mode: persistence is unavailable, hide save/delete affordances. */
  readonly?: boolean
  /**
   * Unclaimed queries from the machine-wide file earlier versions wrote.
   * Empty hides the import entry completely.
   */
  legacy?: SavedQuery[]
}>()

const emit = defineEmits<{
  load: [entry: Query]
  remove: [entry: SavedQuery]
  save: [input: { title?: string, description?: string, scope: SavedQueryScope }]
  /** Claim the selected legacy records into this project, or discard them. */
  legacyResolve: [input: { ids: string[], mode: LegacyQueriesMode }]
}>()

const dialogOpen = ref(false)
const title = ref('')
const description = ref('')
const scope = ref<SavedQueryScope>('project')

const scopeOptions = [
  { value: 'project', label: 'Just me', icon: 'i-ph:user-duotone' },
  { value: 'workspace', label: 'Shared with team', icon: 'i-ph:users-three-duotone' },
]

/** All filter options with their current state, since the modal shows every one. */
const filterStates = computed(() => [
  { label: 'Exclude functions', on: props.currentFilters.excludeFunctions },
  { label: 'Exclude _ props', on: props.currentFilters.excludeUnderscoreProps },
  { label: 'Exclude $ props', on: props.currentFilters.excludeDollarProps },
])

/** Suggested and saved queries unified into one list shape. */
interface ListEntry {
  key: string
  recipe: Query
  icon: string
  /** Set for saved entries only, driving the scope badge and delete button. */
  saved?: SavedQuery
}

const entries = computed<ListEntry[]>(() => [
  ...props.suggested.map(entry => ({
    key: `suggested:${entry.query}`,
    recipe: entry,
    icon: 'i-ph:lightbulb-duotone',
  })),
  ...props.saved.map(entry => ({
    key: `${entry.scope}:${entry.id}`,
    recipe: entry as Query,
    icon: 'i-ph:code-duotone',
    saved: entry,
  })),
])

function openDialog(): void {
  title.value = ''
  description.value = ''
  dialogOpen.value = true
}

function submit(): void {
  emit('save', {
    title: title.value.trim() || undefined,
    description: description.value.trim() || undefined,
    scope: scope.value,
  })
  dialogOpen.value = false
}

// ── legacy import ────────────────────────────────────────────────────

const legacyOpen = ref(false)
/** Ids checked in the import dialog; every record starts checked. */
const legacySelected = ref<string[]>([])
const legacyAllSelected = computed(() =>
  (props.legacy?.length ?? 0) > 0 && legacySelected.value.length === props.legacy?.length,
)

function openLegacy(): void {
  legacySelected.value = (props.legacy ?? []).map(entry => entry.id)
  legacyOpen.value = true
}

function toggleLegacy(id: string): void {
  legacySelected.value = legacySelected.value.includes(id)
    ? legacySelected.value.filter(entry => entry !== id)
    : [...legacySelected.value, id]
}

function toggleAllLegacy(): void {
  legacySelected.value = legacyAllSelected.value
    ? []
    : (props.legacy ?? []).map(entry => entry.id)
}

function submitLegacy(mode: LegacyQueriesMode): void {
  if (!legacySelected.value.length)
    return
  emit('legacyResolve', { ids: legacySelected.value, mode })
  legacySelected.value = []
  legacyOpen.value = false
}

interface FilterBadge {
  label: string
  title: string
}

/** The filters a recipe carries, as pretty pill badges. */
function filterBadges(entry: Query): FilterBadge[] {
  const out: FilterBadge[] = []
  if (entry.excludeFunctions)
    out.push({ label: 'no fn', title: 'Excludes functions' })
  if (entry.excludeUnderscoreProps)
    out.push({ label: 'no _', title: 'Excludes _-prefixed props' })
  if (entry.excludeDollarProps)
    out.push({ label: 'no $', title: 'Excludes $-prefixed props' })
  return out
}
</script>

<template>
  <div class="flex flex-col gap-2 min-h-0">
    <!-- One-time import: earlier versions kept one file for every project. -->
    <div
      v-if="legacy?.length && !readonly"
      class="flex items-start gap-2 px-2 py-1.5 border border-base rounded bg-secondary"
    >
      <span class="shrink-0 color-active i-ph:clock-counter-clockwise-duotone" />
      <div class="flex flex-col min-w-0 flex-1">
        <span class="text-xs">Older Vite DevTools versions saved private queries from every project in one file.</span>
        <span class="text-11px color-faint">{{ legacy.length }} still unclaimed. Import the ones that belong to this project.</span>
      </div>
      <ActionButton class="text-sm shrink-0" @click="openLegacy">
        Review
      </ActionButton>
    </div>

    <div class="flex items-center gap-2">
      <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
        Saved Queries
      </div>
      <span v-if="saved.length + suggested.length" class="text-xs op-fade font-mono tabular-nums">({{ saved.length + suggested.length }})</span>
      <div class="flex-1" />
      <ActionButton v-if="!readonly" class="text-sm" icon="i-ph:bookmark-simple-duotone" @click="openDialog">
        Save query
      </ActionButton>
    </div>

    <div v-if="entries.length" class="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-1">
      <div
        v-for="entry in entries"
        :key="entry.key"
        class="group flex items-center gap-2 px1.5 py-1 border border-base rounded hover:bg-active cursor-pointer"
        :title="entry.recipe.description ?? entry.recipe.query"
        @click="emit('load', entry.recipe)"
      >
        <span class="shrink-0 color-active" :class="entry.icon" />
        <div class="flex flex-col min-w-0">
          <span class="text-sm truncate">{{ entry.recipe.title ?? (entry.recipe.query || '$ (entire object)') }}</span>
          <span v-if="entry.recipe.title || !entry.recipe.query" class="font-mono text-11px color-faint truncate">{{ entry.recipe.query || '$' }}</span>
        </div>
        <div class="flex-1" />
        <span
          v-for="badge in filterBadges(entry.recipe)"
          :key="badge.label"
          :title="badge.title"
          class="shrink-0 font-mono text-10px color-muted bg-secondary border border-base rounded px-1.5 py-0.5 leading-none"
        >{{ badge.label }}</span>
        <ActionIconButton
          v-if="entry.saved && !readonly"
          icon="i-ph:trash-duotone"
          label="Delete"
          tooltip="Delete"
          class="text-sm op0 group-hover:op100 transition-opacity"
          @click.stop="emit('remove', entry.saved)"
        />
      </div>
    </div>
    <div v-else class="text-xs color-faint px-1 select-none">
      No queries yet. Compose one and hit "Save query".
    </div>

    <OverlayModal
      v-model:open="legacyOpen"
      title="Import saved queries"
      description="Earlier versions of Vite DevTools wrote private queries from every project on this machine into one file. Claim the ones that belong to this project; the rest stay unclaimed for the other projects."
    >
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2 text-xs">
          <ActionButton class="text-sm" @click="toggleAllLegacy">
            {{ legacyAllSelected ? 'Select none' : 'Select all' }}
          </ActionButton>
          <span class="color-faint">{{ legacySelected.length }} of {{ legacy?.length ?? 0 }} selected</span>
        </div>
        <label
          v-for="record in legacy"
          :key="record.id"
          class="flex items-start gap-2 px-2 py-1.5 rounded border border-base hover:bg-active cursor-pointer"
        >
          <FormCheckbox
            :model-value="legacySelected.includes(record.id)"
            @update:model-value="toggleLegacy(record.id)"
          />
          <div class="flex flex-col min-w-0">
            <span class="text-sm truncate">{{ record.title ?? record.query }}</span>
            <span class="font-mono text-11px color-faint truncate">{{ record.query }}</span>
          </div>
        </label>
      </div>
      <template #footer>
        <ActionButton :disabled="!legacySelected.length" @click="submitLegacy('discard')">
          Discard
        </ActionButton>
        <ActionButton variant="primary" :disabled="!legacySelected.length" @click="submitLegacy('claim')">
          Claim into this project
        </ActionButton>
      </template>
    </OverlayModal>

    <OverlayModal
      v-model:open="dialogOpen"
      title="Save query"
      description="Stores the query text together with the active filter options."
    >
      <div class="flex flex-col gap-3">
        <div class="px-3 py-2 rounded-lg bg-secondary border border-base font-mono text-xs whitespace-pre-wrap break-all max-h-24 overflow-auto">
          {{ currentQuery.trim() || '$' }}
        </div>
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <span class="color-muted">Filters:</span>
          <span
            v-for="state in filterStates"
            :key="state.label"
            class="flex items-center gap-1"
            :class="state.on ? 'color-base' : 'color-faint'"
          >
            <span :class="state.on ? 'i-ph:check-circle-duotone color-active' : 'i-ph:circle-duotone'" />
            {{ state.label }}
          </span>
        </div>
        <FormTextInput v-model="title" placeholder="Title (optional, becomes the storage id)" />
        <FormTextInput v-model="description" placeholder="Description (optional)" />
        <div class="flex flex-col gap-1.5">
          <span class="text-xs color-muted">Save location</span>
          <ActionToggleGroup v-model="scope" :options="scopeOptions" />
          <span class="text-11px color-faint">
            {{ scope === 'workspace' ? '.devframe/, committed and shared with the team' : 'node_modules/, this checkout only' }}
          </span>
        </div>
      </div>
      <template #footer>
        <ActionButton @click="dialogOpen = false">
          Cancel
        </ActionButton>
        <ActionButton variant="primary" @click="submit">
          Save
        </ActionButton>
      </template>
    </OverlayModal>
  </div>
</template>
