import type { DevframeMessageEntry, DevframeMessageEntryFrom, DevframeMessageLevel } from '@devframes/hub/types'
import type { MaybeRefOrGetter } from 'vue'
import { computed, reactive, ref, toValue } from 'vue'
import { fromEntries, levelPriority, levels } from '../components/message-styles'

export type SortMode = 'newest' | 'oldest' | 'level'

const SORT_MODES: SortMode[] = ['newest', 'oldest', 'level']

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  level: 'By severity',
}

const SORT_ICONS: Record<SortMode, string> = {
  newest: 'i-ph:sort-descending-duotone',
  oldest: 'i-ph:sort-ascending-duotone',
  level: 'i-ph:warning-diamond-duotone',
}

/**
 * The reactive search / sort / filter state over a message feed, plus the
 * derived `filteredEntries`. Instantiated once in the smart wrapper (`App.vue`)
 * so the nav bar's search + actions and the body's filter bar share a single
 * source of truth. Returned as a `reactive` façade so its refs auto-unwrap in
 * templates and can be threaded through as one prop.
 */
export interface MessageFilters {
  search: string
  sortBy: SortMode
  /** Human label for the active sort mode (tooltip). */
  readonly sortLabel: string
  /** Phosphor icon class for the active sort mode. */
  readonly sortIcon: string
  cycleSortMode: () => void

  activeLevels: Set<DevframeMessageLevel>
  activeSources: Set<DevframeMessageEntryFrom>
  activeCategories: Set<string>
  activeLabels: Set<string>
  toggleLevel: (level: string) => void
  toggleSource: (from: DevframeMessageEntryFrom) => void
  toggleCategory: (category: string) => void
  toggleLabel: (label: string) => void

  readonly allLevels: DevframeMessageLevel[]
  readonly allSources: DevframeMessageEntryFrom[]
  readonly allCategories: string[]
  readonly allLabels: string[]

  readonly hasActiveFilter: boolean
  resetFilters: () => void

  /** Every entry, unfiltered (for resolving a still-selected entry). */
  readonly allEntries: DevframeMessageEntry[]
  /** Entries matching the current filters, in the active sort order. */
  readonly filteredEntries: DevframeMessageEntry[]
  readonly totalCount: number
  readonly filteredCount: number
}

export function useMessageFilters(source: MaybeRefOrGetter<DevframeMessageEntry[]>): MessageFilters {
  const search = ref('')
  const sortBy = ref<SortMode>('newest')
  const activeLevels = ref(new Set<DevframeMessageLevel>())
  const activeSources = ref(new Set<DevframeMessageEntryFrom>())
  const activeCategories = ref(new Set<string>())
  const activeLabels = ref(new Set<string>())

  const allEntries = computed(() => toValue(source))

  function cycleSortMode(): void {
    const idx = SORT_MODES.indexOf(sortBy.value)
    sortBy.value = SORT_MODES[(idx + 1) % SORT_MODES.length]!
  }

  function toggle<T>(set: Set<T>, value: T): void {
    if (set.has(value))
      set.delete(value)
    else
      set.add(value)
  }

  const allLabels = computed(() => {
    const labels = new Set<string>()
    for (const entry of allEntries.value) {
      for (const label of entry.labels ?? [])
        labels.add(label)
    }
    return Array.from(labels).sort()
  })

  const allCategories = computed(() => {
    const cats = new Set<string>()
    for (const entry of allEntries.value) {
      if (entry.category)
        cats.add(entry.category)
    }
    return Array.from(cats).sort()
  })

  const hasActiveFilter = computed(() =>
    activeLevels.value.size > 0
    || activeSources.value.size > 0
    || activeCategories.value.size > 0
    || activeLabels.value.size > 0
    || search.value.length > 0)

  function resetFilters(): void {
    activeLevels.value.clear()
    activeSources.value.clear()
    activeCategories.value.clear()
    activeLabels.value.clear()
    search.value = ''
  }

  const filteredEntries = computed<DevframeMessageEntry[]>(() => {
    let entries = allEntries.value
    if (activeLevels.value.size > 0)
      entries = entries.filter(e => activeLevels.value.has(e.level))
    if (activeSources.value.size > 0)
      entries = entries.filter(e => activeSources.value.has(e.from as DevframeMessageEntryFrom))
    if (activeCategories.value.size > 0)
      entries = entries.filter(e => e.category != null && activeCategories.value.has(e.category))
    if (activeLabels.value.size > 0)
      entries = entries.filter(e => e.labels?.some(l => activeLabels.value.has(l)))
    if (search.value) {
      const q = search.value.toLowerCase()
      entries = entries.filter(e =>
        e.message.toLowerCase().includes(q)
        || e.description?.toLowerCase().includes(q)
        || e.from?.toLowerCase().includes(q)
        || e.category?.toLowerCase().includes(q)
        || e.labels?.some(l => l.toLowerCase().includes(q)))
    }

    if (sortBy.value === 'oldest')
      return [...entries]
    if (sortBy.value === 'level')
      return entries.toSorted((a, b) => levelPriority[a.level] - levelPriority[b.level])
    return entries.toReversed()
  })

  return reactive({
    search,
    sortBy,
    sortLabel: computed(() => SORT_LABELS[sortBy.value]),
    sortIcon: computed(() => SORT_ICONS[sortBy.value]),
    cycleSortMode,

    activeLevels,
    activeSources,
    activeCategories,
    activeLabels,
    toggleLevel: (level: string) => toggle(activeLevels.value, level as DevframeMessageLevel),
    toggleSource: (from: DevframeMessageEntryFrom) => toggle(activeSources.value, from),
    toggleCategory: (category: string) => toggle(activeCategories.value, category),
    toggleLabel: (label: string) => toggle(activeLabels.value, label),

    allLevels: Object.keys(levels) as DevframeMessageLevel[],
    allSources: Object.keys(fromEntries) as DevframeMessageEntryFrom[],
    allCategories,
    allLabels,

    hasActiveFilter,
    resetFilters,

    allEntries,
    filteredEntries,
    totalCount: computed(() => allEntries.value.length),
    filteredCount: computed(() => filteredEntries.value.length),
  }) as MessageFilters
}
