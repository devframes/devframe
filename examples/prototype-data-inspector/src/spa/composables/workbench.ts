/**
 * PROTOTYPE — the query workbench pipeline:
 * debounced auto-run, client-side jora syntax gate (malformed queries never
 * hit the wire), stale-response sequencing, non-destructive errors (the last
 * good result stays), remote stat-mode suggestions, client query settings,
 * and the source SKELETON ("what data are available", query-independent).
 * An empty query runs `$` (the root), so every source lands on a full view.
 */
import type { DataSourceMeta, FilterOptions, QueryOutcome, QueryStats, SkeletonOutcome, SuggestItem, SuggestOutcome } from '../../rpc-contract'
import jora from 'jora'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { call } from './rpc'

export type SyntaxState
  = | { kind: 'ok' }
    | { kind: 'pending' } // incomplete at the cursor: soft state, keep typing
    | { kind: 'error', message: string }

const AUTO_RUN_DEBOUNCE = 400
const SUGGEST_DEBOUNCE = 150
const URL_SYNC_DEBOUNCE = 300
const DRAFTS_KEY = 'data-inspector:drafts'

const FILTER_KEYS = ['excludeFunctions', 'excludeUnderscoreProps', 'excludeDollarProps'] as const

/** Per-source query drafts, persisted in localStorage. */
function loadDrafts(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  }
  catch {
    return {}
  }
}

function checkSyntax(query: string): SyntaxState {
  try {
    jora.syntax.parse(query)
    return { kind: 'ok' }
  }
  catch (error) {
    const e = error as Error & { details?: { loc?: { range?: [number, number] } } }
    const range = e.details?.loc?.range
    // An error at (or beyond) the end of input means the query is merely
    // incomplete while typing.
    if (!range || range[1] >= query.trimEnd().length)
      return { kind: 'pending' }
    return { kind: 'error', message: e.message }
  }
}

/** Read the shareable workbench state from the page URL. */
function readUrlState(): { sourceId: string, query: string, filters: FilterOptions } {
  const params = new URLSearchParams(location.search)
  const filters: FilterOptions = {}
  for (const key of FILTER_KEYS) {
    if (params.get(key) === '1')
      filters[key] = true
  }
  return {
    sourceId: params.get('source') ?? '',
    query: params.get('query') ?? '',
    filters,
  }
}

export function useWorkbench() {
  const initial = readUrlState()

  const sources = ref<DataSourceMeta[]>([])
  const sourceId = ref(initial.sourceId)
  const query = ref(initial.query)

  // ── per-source query drafts (restored/reset on source switch) ───────
  const drafts = loadDrafts()
  let restoringDraft = false

  function saveDraft(): void {
    if (!sourceId.value)
      return
    if (query.value)
      drafts[sourceId.value] = query.value
    else
      delete drafts[sourceId.value]
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
  }

  function restoreDraft(): void {
    restoringDraft = true
    query.value = drafts[sourceId.value] ?? ''
  }

  const settings = reactive<Required<FilterOptions>>({
    excludeFunctions: false,
    excludeUnderscoreProps: false,
    excludeDollarProps: false,
    ...initial.filters,
  })

  // ── URL persistence: source, query, and filters stay shareable ──────
  let urlTimer: ReturnType<typeof setTimeout> | undefined
  function syncUrl(): void {
    clearTimeout(urlTimer)
    urlTimer = setTimeout(() => {
      const params = new URLSearchParams()
      if (sourceId.value)
        params.set('source', sourceId.value)
      if (query.value)
        params.set('query', query.value)
      for (const key of FILTER_KEYS) {
        if (settings[key])
          params.set(key, '1')
      }
      const search = params.toString()
      history.replaceState(null, '', search ? `?${search}` : location.pathname)
    }, URL_SYNC_DEBOUNCE)
  }

  const syntax = ref<SyntaxState>({ kind: 'ok' })
  const running = ref(false)
  const serverError = ref<string | null>(null)
  const stats = ref<(QueryStats & { rpcMs: number }) | null>(null)
  const statsStale = ref(false)
  const result = shallowRef<unknown>()
  const hasResult = ref(false)

  const suggestions = ref<SuggestItem[]>([])

  const skeleton = shallowRef<unknown>()
  const skeletonError = ref<string | null>(null)
  const skeletonLoading = ref(false)

  const activeSource = computed(() => sources.value.find(s => s.id === sourceId.value))

  async function loadSources(): Promise<void> {
    sources.value = await call<DataSourceMeta[]>('data-inspector:sources')
    if (!sourceId.value || !sources.value.some(s => s.id === sourceId.value))
      sourceId.value = sources.value[0]?.id ?? ''
    // A query arriving via the URL becomes the draft for its source, so the
    // source-switch restore below can never clobber a shared link.
    if (initial.query)
      saveDraft()
  }

  // ── auto-run with syntax gate + stale-drop ─────────────────────────
  let runSeq = 0
  let runTimer: ReturnType<typeof setTimeout> | undefined

  async function runNow(): Promise<void> {
    clearTimeout(runTimer)
    suggestions.value = []
    if (!sourceId.value)
      return
    // An empty query still fires: `$` displays the entire source object.
    const text = query.value.trim() || '$'

    if (text !== '$') {
      const check = checkSyntax(text)
      syntax.value = check
      if (check.kind !== 'ok')
        return // never send malformed queries over the wire
    }
    else {
      syntax.value = { kind: 'ok' }
    }

    const seq = ++runSeq
    running.value = true
    const started = performance.now()
    let outcome: QueryOutcome
    try {
      outcome = await call<QueryOutcome>('data-inspector:query', sourceId.value, text, { ...settings })
    }
    catch (error) {
      if (seq === runSeq) {
        running.value = false
        serverError.value = `rpc: ${error instanceof Error ? error.message : String(error)}`
        statsStale.value = true
      }
      return
    }
    if (seq !== runSeq)
      return // superseded by a newer keystroke
    running.value = false

    if (!outcome.ok) {
      serverError.value = `${outcome.error.name}: ${outcome.error.message}`
      statsStale.value = true
      return
    }
    serverError.value = null
    statsStale.value = false
    stats.value = { ...outcome.stats, rpcMs: Math.round(performance.now() - started) }
    result.value = outcome.result
    hasResult.value = true
  }

  function scheduleRun(): void {
    clearTimeout(runTimer)
    runTimer = setTimeout(() => void runNow(), AUTO_RUN_DEBOUNCE)
  }

  // ── skeleton: what data are available (query-independent) ──────────
  let skeletonSeq = 0

  async function loadSkeleton(): Promise<void> {
    if (!sourceId.value)
      return
    const seq = ++skeletonSeq
    skeletonLoading.value = true
    let out: SkeletonOutcome
    try {
      out = await call<SkeletonOutcome>('data-inspector:skeleton', sourceId.value, { ...settings })
    }
    catch (error) {
      if (seq === skeletonSeq) {
        skeletonLoading.value = false
        skeletonError.value = `rpc: ${error instanceof Error ? error.message : String(error)}`
      }
      return
    }
    if (seq !== skeletonSeq)
      return
    skeletonLoading.value = false
    if (!out.ok) {
      skeletonError.value = `${out.error.name}: ${out.error.message}`
      return
    }
    skeletonError.value = null
    skeleton.value = out.skeleton
  }

  // ── remote suggestions ─────────────────────────────────────────────
  let suggestSeq = 0
  let suggestTimer: ReturnType<typeof setTimeout> | undefined

  async function requestSuggestions(pos: number): Promise<void> {
    const seq = ++suggestSeq
    let out: SuggestOutcome
    try {
      out = await call<SuggestOutcome>('data-inspector:suggest', sourceId.value, query.value, pos)
    }
    catch {
      return // best-effort; transport errors never surface here
    }
    if (seq !== suggestSeq)
      return
    // jora returns the full candidate set per range; prefix-filter client-side.
    suggestions.value = (out.ok ? out.suggestions : []).filter(s =>
      !s.current || s.value.toLowerCase().startsWith(s.current.toLowerCase()),
    )
  }

  function scheduleSuggestions(pos: number): void {
    clearTimeout(suggestTimer)
    suggestTimer = setTimeout(() => void requestSuggestions(pos), SUGGEST_DEBOUNCE)
  }

  function acceptSuggestion(item: SuggestItem): string {
    const text = query.value
    query.value = text.slice(0, item.from) + item.value + text.slice(item.to)
    suggestions.value = []
    void runNow()
    return query.value
  }

  /** Load a query recipe: text + the filter options it was authored with. */
  function applyRecipe(recipe: { query: string } & FilterOptions): void {
    for (const key of FILTER_KEYS)
      settings[key] = recipe[key] ?? false
    query.value = recipe.query
    void runNow()
  }

  watch(query, () => {
    saveDraft()
    syncUrl()
    if (restoringDraft) {
      // Draft restores ride the source-switch runNow; skip the debounce run.
      restoringDraft = false
      return
    }
    scheduleRun()
  })
  watch(sourceId, () => {
    suggestions.value = []
    restoreDraft()
    syncUrl()
    void runNow()
    void loadSkeleton()
  })
  watch(settings, () => {
    syncUrl()
    void runNow()
    void loadSkeleton()
  })

  return {
    sources,
    sourceId,
    activeSource,
    query,
    settings,
    syntax,
    running,
    serverError,
    stats,
    statsStale,
    result,
    hasResult,
    suggestions,
    skeleton,
    skeletonError,
    skeletonLoading,
    loadSources,
    loadSkeleton,
    runNow,
    requestSuggestions,
    scheduleSuggestions,
    acceptSuggestion,
    applyRecipe,
  }
}

export type Workbench = ReturnType<typeof useWorkbench>
