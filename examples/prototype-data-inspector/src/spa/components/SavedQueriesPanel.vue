<script setup lang="ts">
import type { FilterOptions, Query, SavedQuery, SavedQueryScope } from '../../rpc-contract'
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import ActionIconButton from '@antfu/design/components/Action/ActionIconButton.vue'
import DisplayBadge from '@antfu/design/components/Display/DisplayBadge.vue'
import FormSelect from '@antfu/design/components/Form/FormSelect.vue'
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
}>()

const emit = defineEmits<{
  load: [entry: Query]
  remove: [entry: SavedQuery]
  save: [input: { title?: string, description?: string, scope: SavedQueryScope }]
}>()

const dialogOpen = ref(false)
const title = ref('')
const description = ref('')
const scope = ref<SavedQueryScope>('user')

const scopeOptions = [
  { value: 'user', label: 'User (node_modules, just me)' },
  { value: 'project', label: 'Project (.devframe, shared)' },
]

/** All filter options with their current state — the modal shows every one. */
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
  /** Set for saved entries only — drives the scope badge and delete button. */
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

function filterBadges(entry: Query): string[] {
  const out: string[] = []
  if (entry.excludeFunctions)
    out.push('-fn')
  if (entry.excludeUnderscoreProps)
    out.push('-_')
  if (entry.excludeDollarProps)
    out.push('-$')
  return out
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <div class="font-semibold text-xs op-fade uppercase tracking-wide select-none">
        Saved Queries
      </div>
      <span v-if="saved.length + suggested.length" class="text-xs op-fade font-mono tabular-nums">({{ saved.length + suggested.length }})</span>
      <div class="flex-1" />
      <ActionButton class="text-sm" icon="i-ph:bookmark-simple-duotone" @click="openDialog">
        Save query
      </ActionButton>
    </div>

    <div v-if="entries.length" class="overflow-auto min-h-0 max-h-200 grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] gap-2">
      <div
        v-for="entry in entries"
        :key="entry.key"
        class="group flex items-center gap-2 px-2 py-1.5 border border-base rounded-lg hover:bg-active cursor-pointer"
        :title="entry.recipe.description ?? entry.recipe.query"
        @click="emit('load', entry.recipe)"
      >
        <span class="shrink-0 color-active" :class="entry.icon" />
        <div class="flex flex-col min-w-0">
          <span class="text-sm truncate">{{ entry.recipe.title ?? (entry.recipe.query || '$ (entire object)') }}</span>
          <span v-if="entry.recipe.title || !entry.recipe.query" class="font-mono text-11px color-faint truncate">{{ entry.recipe.query || '$' }}</span>
        </div>
        <div class="flex-1" />
        <span v-for="badge in filterBadges(entry.recipe)" :key="badge" class="font-mono text-10px color-faint">{{ badge }}</span>
        <template v-if="entry.saved">
          <ActionIconButton
            size="sm"
            icon="i-ph:trash-duotone"
            label="Delete"
            tooltip="Delete"
            class="op0 group-hover:op100 transition-opacity"
            @click.stop="emit('remove', entry.saved)"
          />
          <DisplayBadge
            :text="entry.saved.scope"
            :color="entry.saved.scope === 'project' ? 150 : false"
            class="shrink-0"
          />
        </template>
        <DisplayBadge v-else text="suggested" :color="false" class="shrink-0" />
      </div>
    </div>
    <div v-else class="text-xs color-faint px-1 select-none">
      No queries yet. Compose one and hit "Save query".
    </div>

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
        <FormSelect v-model="scope" :options="scopeOptions" />
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
