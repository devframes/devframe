/**
 * The query workbench pipeline:
 * debounced auto-run, client-side jora syntax gate (malformed queries never
 * hit the wire), stale-response sequencing, non-destructive errors (the last
 * good result stays), remote stat-mode suggestions, client query settings,
 * and the source SKELETON ("what data are available", query-independent).
 * An empty query runs `$` (the root), so every source lands on a full view.
 */
import type { InjectionKey } from 'vue'
import type { DataSourceMeta, FilterOptions, NodePath, QueryOutcome, QueryStats, SkeletonOutcome, SuggestItem, SuggestOutcome, WriteOutcome, WriteRequest } from '../../engine'
import jora from 'jora'
import { computed, inject, reactive, ref, shallowRef, watch } from 'vue'
import { backend, connection } from './rpc'

export type SyntaxState
  = | { kind: 'ok' }
    | { kind: 'pending' } // incomplete at the cursor: soft state, keep typing
    | { kind: 'error', message: string }

const AUTO_RUN_DEBOUNCE = 400
const SUGGEST_DEBOUNCE = 150
const URL_SYNC_DEBOUNCE = 300
const DRAFTS_KEY = 'data-inspector:drafts'

/** Default period for the "auto rerun every N seconds" poller. */
const DEFAULT_AUTO_RERUN_SECONDS = 5
/** Clamp the poll period into a sane range (sub-second polling is abusive). */
const MIN_AUTO_RERUN_SECONDS = 1
const MAX_AUTO_RERUN_SECONDS = 3600

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

/** Clamp a poll period (seconds) into the accepted range. */
function clampSeconds(value: number): number {
  if (!Number.isFinite(value))
    return DEFAULT_AUTO_RERUN_SECONDS
  return Math.min(MAX_AUTO_RERUN_SECONDS, Math.max(MIN_AUTO_RERUN_SECONDS, Math.round(value)))
}

/** Read the shareable workbench state from the page URL hash. */
function readUrlState(): { sourceId: string, query: string, filters: FilterOptions, autoRun: boolean, autoRunSeconds: number } {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''))
  const filters: FilterOptions = {}
  for (const key of FILTER_KEYS) {
    if (params.get(key) === '1')
      filters[key] = true
  }
  const seconds = Number(params.get('autorunSecs'))
  return {
    sourceId: params.get('source') ?? '',
    query: params.get('query') ?? '',
    filters,
    autoRun: params.get('autorun') === '1',
    autoRunSeconds: seconds ? clampSeconds(seconds) : DEFAULT_AUTO_RERUN_SECONDS,
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

  // ── auto-rerun: poll the live object on a fixed period ──────────────
  const autoRun = ref(initial.autoRun)
  const autoRunSeconds = ref(initial.autoRunSeconds)

  // URL persistence: source, query, and filters live in the hash
  // (`#source=…&query=…`) so a copied link is self-contained and leaves the
  // server-handshake query string alone. `replaceState` keeps keystrokes out
  // of history; the guarded write skips no-op re-applies after a `hashchange`.
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
      if (autoRun.value) {
        params.set('autorun', '1')
        params.set('autorunSecs', String(autoRunSeconds.value))
      }
      const hash = params.toString()
      if (location.hash.replace(/^#/, '') === hash)
        return
      history.replaceState(history.state, '', hash ? `#${hash}` : location.pathname + location.search)
    }, URL_SYNC_DEBOUNCE)
  }

  /**
   * Re-apply the full workbench state from the URL hash, the live reaction to
   * back/forward and manual address-bar edits (`hashchange`). Source is set
   * first so its draft-restore runs before the shared query overwrites it; an
   * unknown source id is left for `loadSources` to pick up. `replaceState`
   * writes never fire `hashchange`, so this can't loop with `syncUrl`.
   */
  function applyUrlState(): void {
    const next = readUrlState()
    if (next.sourceId && next.sourceId !== sourceId.value && sources.value.some(s => s.id === next.sourceId))
      sourceId.value = next.sourceId
    query.value = next.query
    for (const key of FILTER_KEYS)
      settings[key] = next.filters[key] ?? false
    autoRun.value = next.autoRun
    autoRunSeconds.value = next.autoRunSeconds
  }

  const syntax = ref<SyntaxState>({ kind: 'ok' })
  const running = ref(false)
  const serverError = ref<string | null>(null)
  const stats = ref<(QueryStats & { rpcMs: number }) | null>(null)
  const statsStale = ref(false)
  const result = shallowRef<unknown>()
  const hasResult = ref(false)
  /** When the last successful query landed, driving the "ran … ago" label. */
  const lastRunAt = ref<number | null>(null)

  const suggestions = ref<SuggestItem[]>([])

  const skeleton = shallowRef<unknown>()
  const skeletonError = ref<string | null>(null)
  const skeletonLoading = ref(false)

  const activeSource = computed(() => sources.value.find(s => s.id === sourceId.value))

  /**
   * The result maps 1:1 onto the live source only for the identity query;
   * a derived jora result (map/group/...) has no address back into the
   * source, so edit paths are only provable on the root view.
   */
  const isIdentityQuery = computed(() => {
    const text = query.value.trim()
    return !text || text === '$'
  })

  /** Live edits apply: rpc mode, a writable source, and the identity view. */
  const canEdit = computed(() =>
    connection.mode === 'rpc' && !!activeSource.value?.writable && isIdentityQuery.value)

  /** Why editing is absent right now, driving the viewer's lock hint. */
  const editHint = computed<'readonly-source' | 'derived-view' | null>(() => {
    if (connection.mode !== 'rpc' || !activeSource.value)
      return null
    if (!activeSource.value.writable)
      return 'readonly-source'
    if (!isIdentityQuery.value)
      return 'derived-view'
    return null
  })

  // A dock-activation focus (`focusSource`) that names a source not yet
  // registered waits here until `loadSources` sees it arrive, then fires once.
  let pendingFocusId: string | null = null

  async function loadSources(): Promise<void> {
    sources.value = await backend().sources()
    if (pendingFocusId && sources.value.some(s => s.id === pendingFocusId)) {
      sourceId.value = pendingFocusId
      pendingFocusId = null
    }
    if (!sourceId.value || !sources.value.some(s => s.id === sourceId.value))
      sourceId.value = sources.value[0]?.id ?? ''
    // A query arriving via the URL becomes the draft for its source, so the
    // source-switch restore below can never clobber a shared link.
    if (initial.query)
      saveDraft()
  }

  /**
   * Select a source by id, the deep-link target of the hub's dock activation
   * (`params.sourceId`). If the source isn't registered yet, remember it and
   * converge the moment it appears (one-shot), mirroring the terminals dock.
   */
  function focusSource(id: string): void {
    if (sources.value.some(s => s.id === id)) {
      sourceId.value = id
      pendingFocusId = null
    }
    else {
      pendingFocusId = id
    }
  }

  // ── auto-run with syntax gate + stale-drop ─────────────────────────
  let runSeq = 0
  let runTimer: ReturnType<typeof setTimeout> | undefined

  async function runNow(): Promise<void> {
    clearTimeout(runTimer)
    // Deliberately leaves `suggestions` alone: executions (auto-run included)
    // must not close the autocomplete while the user is still composing.
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
      outcome = await backend().query(sourceId.value, text, { ...settings })
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
    lastRunAt.value = Date.now()
  }

  function scheduleRun(): void {
    clearTimeout(runTimer)
    runTimer = setTimeout(() => void runNow(), AUTO_RUN_DEBOUNCE)
  }

  // Auto-rerun poller: re-runs read the live object afresh (watch a value
  // change). A tick is skipped while a run is in flight or the query can't
  // parse, so the poller never piles up requests. It pauses while the tab is
  // backgrounded and resumes with a catch-up run.
  let autoRunTimer: ReturnType<typeof setInterval> | undefined
  function pageHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden
  }
  function restartAutoRerun(): void {
    clearInterval(autoRunTimer)
    autoRunTimer = undefined
    if (!autoRun.value || pageHidden())
      return
    autoRunTimer = setInterval(() => {
      if (running.value || syntax.value.kind === 'error')
        return
      void runNow()
    }, clampSeconds(autoRunSeconds.value) * 1000)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!autoRun.value)
        return
      restartAutoRerun() // clears the timer while hidden, recreates it on return
      if (!pageHidden() && !running.value && syntax.value.kind !== 'error')
        void runNow() // catch up on whatever changed while the tab was away
    })
  }

  /**
   * Lazily expand a depth-truncated node: fetch a fresh, depth-limited slice
   * of the subtree the `$truncated: 'depth'` marker at `path` stands in for.
   * Runs against the same source/query/filters as the current result, so the
   * slice lines up with what is on screen. Returns the normalized subtree, or
   * throws with a readable message the caller surfaces inline.
   */
  async function expandNode(path: NodePath): Promise<unknown> {
    if (!sourceId.value)
      throw new Error('no source selected')
    const text = query.value.trim() || '$'
    const outcome = await backend().queryPath(sourceId.value, text, path, { ...settings })
    if (!outcome.ok)
      throw new Error(`${outcome.error.name}: ${outcome.error.message}`)
    return outcome.result
  }

  /**
   * Apply one edit to the live source and refresh the whole view on success
   * (the query result AND the skeleton reflect reality immediately). Returns
   * the outcome so the edit panel can surface a failure inline.
   */
  async function applyEdit(request: WriteRequest): Promise<WriteOutcome> {
    if (!sourceId.value)
      return { ok: false, error: { name: 'NoSource', message: 'no source selected' } }
    let outcome: WriteOutcome
    try {
      // Only excludeFunctions shifts array indices server-side; thread it so
      // `['i', n]` steps line up with what is rendered.
      outcome = await backend().write(sourceId.value, request, { excludeFunctions: settings.excludeFunctions })
    }
    catch (error) {
      return { ok: false, error: { name: 'RpcError', message: error instanceof Error ? error.message : String(error) } }
    }
    if (outcome.ok) {
      void runNow()
      void loadSkeleton()
    }
    return outcome
  }

  // ── data-changed reactions (writes elsewhere, server notifications) ─
  // Auto re-run behind a trailing throttle so bursts from a chatty source
  // collapse into one refresh.
  const DATA_CHANGED_THROTTLE = 300
  let dataChangedTimer: ReturnType<typeof setTimeout> | undefined

  function handleDataChanged(changedSourceId: string): void {
    if (changedSourceId !== sourceId.value || dataChangedTimer)
      return
    dataChangedTimer = setTimeout(() => {
      dataChangedTimer = undefined
      if (running.value || syntax.value.kind === 'error')
        return
      void runNow()
      void loadSkeleton()
    }, DATA_CHANGED_THROTTLE)
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
      out = await backend().skeleton(sourceId.value, { ...settings })
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
      out = await backend().suggest(sourceId.value, query.value, pos)
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
  watch([autoRun, autoRunSeconds], () => {
    autoRunSeconds.value = clampSeconds(autoRunSeconds.value)
    syncUrl()
    restartAutoRerun()
  })
  // Honor auto-rerun restored from a shared URL right away (watchers above
  // are lazy, so an already-on toggle needs an initial kick).
  if (autoRun.value)
    restartAutoRerun()

  // Live reaction: back/forward and manual hash edits re-apply the full state.
  if (typeof window !== 'undefined')
    window.addEventListener('hashchange', applyUrlState)

  // ── query composition helpers ──────────────────────────────────────
  /** Set the query to a single top-level key (from the data-shape panel). */
  function queryProp(key: string): void {
    query.value = /^[a-z_$][\w$]*$/i.test(key) ? key : `$["${key.replaceAll('"', '\\"')}"]`
    void runNow()
  }

  /** Pipe a path onto the current query ("create a subquery from the path"). */
  function applySubquery(path: string): void {
    const current = query.value.trim()
    query.value = current && current !== '$' ? `${current}\n| ${path}` : path
    void runNow()
  }

  /** Append a path to the current query (plain textual append). */
  function appendPath(path: string): void {
    const current = query.value.trim()
    query.value = current ? `${current}${path.startsWith('[') ? '' : '.'}${path}` : path
    void runNow()
  }

  return {
    sources,
    sourceId,
    activeSource,
    query,
    settings,
    autoRun,
    autoRunSeconds,
    syntax,
    running,
    serverError,
    stats,
    statsStale,
    result,
    hasResult,
    lastRunAt,
    suggestions,
    skeleton,
    skeletonError,
    skeletonLoading,
    isIdentityQuery,
    canEdit,
    editHint,
    applyEdit,
    handleDataChanged,
    loadSources,
    loadSkeleton,
    focusSource,
    expandNode,
    runNow,
    requestSuggestions,
    scheduleSuggestions,
    acceptSuggestion,
    applyRecipe,
    queryProp,
    applySubquery,
    appendPath,
  }
}

export type Workbench = ReturnType<typeof useWorkbench>

/** Injection key for the shared workbench, provided by the root, consumed by panels. */
export const workbenchKey: InjectionKey<Workbench> = Symbol('data-inspector:workbench')

/** Inject the workbench provided by the app root. */
export function injectWorkbench(): Workbench {
  const wb = inject(workbenchKey)
  if (!wb)
    throw new Error('workbench not provided')
  return wb
}
