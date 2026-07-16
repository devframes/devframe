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

const activeFilterLabels = computed(() => {
  const labels: string[] = []
  if (props.currentFilters.excludeFunctions)
    labels.push('no functions')
  if (props.currentFilters.excludeUnderscoreProps)
    labels.push('no _ props')
  if (props.currentFilters.excludeDollarProps)
    labels.push('no $ props')
  return labels
})

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
  <div class="flex flex-col gap-2 min-h-0">
    <div class="flex items-center gap-2">
      <span class="text-xs font-medium color-muted uppercase tracking-wide select-none">Queries</span>
      <span v-if="saved.length + suggested.length" class="text-xs color-faint font-mono tabular-nums">{{ saved.length + suggested.length }}</span>
      <div class="flex-1" />
      <ActionButton size="sm" icon="i-ph:bookmark-simple-duotone" @click="openDialog">
        Save query
      </ActionButton>
    </div>

    <div v-if="saved.length || suggested.length" class="flex flex-col gap-1 overflow-auto min-h-0">
      <div
        v-for="entry in suggested"
        :key="`suggested:${entry.query}`"
        class="group flex items-center gap-2 px-2 py-1.5 border border-base rounded-lg hover:bg-active cursor-pointer"
        :title="entry.description ?? entry.query"
        @click="emit('load', entry)"
      >
        <span class="i-ph:lightbulb-duotone color-active shrink-0" />
        <div class="flex flex-col min-w-0">
          <span class="text-sm truncate">{{ entry.title ?? (entry.query || '$ (entire object)') }}</span>
          <span class="font-mono text-11px color-faint truncate">{{ entry.query || '$' }}</span>
        </div>
        <div class="flex-1" />
        <span v-for="badge in filterBadges(entry)" :key="badge" class="font-mono text-10px color-faint">{{ badge }}</span>
        <DisplayBadge text="suggested" :color="false" class="shrink-0" />
      </div>

      <div
        v-for="entry in saved"
        :key="`${entry.scope}:${entry.id}`"
        class="group flex items-center gap-2 px-2 py-1.5 border border-base rounded-lg hover:bg-active cursor-pointer"
        :title="entry.description ?? entry.query"
        @click="emit('load', entry)"
      >
        <span class="i-ph:code-duotone color-active shrink-0" />
        <div class="flex flex-col min-w-0">
          <span class="text-sm truncate">{{ entry.title ?? entry.query }}</span>
          <span v-if="entry.title" class="font-mono text-11px color-faint truncate">{{ entry.query }}</span>
        </div>
        <div class="flex-1" />
        <span v-for="badge in filterBadges(entry)" :key="badge" class="font-mono text-10px color-faint">{{ badge }}</span>
        <DisplayBadge
          :text="entry.scope"
          :color="entry.scope === 'project' ? 150 : false"
          class="shrink-0"
        />
        <ActionIconButton
          size="sm"
          icon="i-ph:trash-duotone"
          label="Delete"
          tooltip="Delete"
          class="op0 group-hover:op100 transition-opacity"
          @click.stop="emit('remove', entry)"
        />
      </div>
    </div>
    <div v-else class="text-xs color-faint px-1 select-none">
      No queries yet. Compose one and hit "Save query".
    </div>

    <!-- TODO: in this save query modal, we should also show the filters -->
    <OverlayModal
      v-model:open="dialogOpen"
      title="Save query"
      description="Stores the query text together with the active filter options."
    >
      <div class="flex flex-col gap-3">
        <div class="px-3 py-2 rounded-lg bg-secondary border border-base font-mono text-xs whitespace-pre-wrap break-all max-h-24 overflow-auto">
          {{ currentQuery.trim() || '$' }}
        </div>
        <div v-if="activeFilterLabels.length" class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs color-muted">Filters:</span>
          <DisplayBadge v-for="label in activeFilterLabels" :key="label" :text="label" :color="false" />
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
