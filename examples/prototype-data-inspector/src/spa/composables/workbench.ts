/**
 * PROTOTYPE — the query workbench pipeline:
 * debounced auto-run, client-side jora syntax gate (malformed queries never
 * hit the wire), stale-response sequencing, non-destructive errors (the last
 * good result stays), and remote stat-mode suggestions.
 */
import type { DataSourceMeta, QueryOutcome, QueryStats, SuggestItem, SuggestOutcome } from '../../rpc-contract'
import jora from 'jora'
import { computed, ref, shallowRef, watch } from 'vue'
import { call } from './rpc'

export type SyntaxState
  = | { kind: 'ok' }
    | { kind: 'pending' } // incomplete at the cursor: soft state, keep typing
    | { kind: 'error', message: string }

const AUTO_RUN_DEBOUNCE = 400
const SUGGEST_DEBOUNCE = 150

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

export function useWorkbench() {
  const sources = ref<DataSourceMeta[]>([])
  const sourceId = ref('')
  const query = ref('')

  const syntax = ref<SyntaxState>({ kind: 'ok' })
  const running = ref(false)
  const serverError = ref<string | null>(null)
  const stats = ref<(QueryStats & { rpcMs: number }) | null>(null)
  const statsStale = ref(false)
  const result = shallowRef<unknown>()
  const hasResult = ref(false)

  const suggestions = ref<SuggestItem[]>([])

  const activeSource = computed(() => sources.value.find(s => s.id === sourceId.value))

  async function loadSources(): Promise<void> {
    sources.value = await call<DataSourceMeta[]>('data-inspector:sources')
    if (!sourceId.value || !sources.value.some(s => s.id === sourceId.value))
      sourceId.value = sources.value[0]?.id ?? ''
  }

  // ── auto-run with syntax gate + stale-drop ─────────────────────────
  let runSeq = 0
  let runTimer: ReturnType<typeof setTimeout> | undefined

  async function runNow(): Promise<void> {
    clearTimeout(runTimer)
    suggestions.value = []
    const text = query.value
    if (!text.trim()) {
      syntax.value = { kind: 'ok' }
      serverError.value = null
      return
    }

    const check = checkSyntax(text)
    syntax.value = check
    if (check.kind !== 'ok')
      return // never send malformed queries over the wire

    const seq = ++runSeq
    running.value = true
    const started = performance.now()
    let outcome: QueryOutcome
    try {
      outcome = await call<QueryOutcome>('data-inspector:query', sourceId.value, text)
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

  watch(query, scheduleRun)
  watch(sourceId, () => {
    suggestions.value = []
    void runNow()
  })

  return {
    sources,
    sourceId,
    activeSource,
    query,
    syntax,
    running,
    serverError,
    stats,
    statsStale,
    result,
    hasResult,
    suggestions,
    loadSources,
    runNow,
    requestSuggestions,
    scheduleSuggestions,
    acceptSuggestion,
  }
}

export type Workbench = ReturnType<typeof useWorkbench>
