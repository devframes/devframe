/* eslint-disable antfu/no-top-level-await -- throwaway prototype; module-level bootstrap is the point */
/**
 * PROTOTYPE — throwaway code. STAGE 2 SPA.
 *
 * Validates the browser half of the live-query architecture:
 *   - connectDevframe() -> RPC to the side-car WS
 *   - a thin custom query editor (textarea) with REMOTE suggestions
 *     (jora stat-mode runs server-side; results arrive over RPC)
 *   - discovery's `struct` view as the result renderer, inside a ViewModel
 *     shadow root, themed via --discovery-* custom props to follow the
 *     chrome's light/dark scheme.
 */
import type { SuggestItem, SuggestOutcome } from '../rpc-contract'
import { ViewModel } from '@discoveryjs/discovery'
import discoveryCss from '@discoveryjs/discovery/dist/discovery.css?inline'
import { connectDevframe } from 'devframe/client'

type QueryOutcome
  = | { ok: true, result: unknown, stats: { queryMs: number, normalize: { ms: number, nodes: number, refs: number } } }
    | { ok: false, error: { name: string, message: string } }

interface SourceMeta { id: string, label: string, description?: string, examples?: string[] }

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T
const sourceEl = $<HTMLSelectElement>('#source')
const queryEl = $<HTMLTextAreaElement>('#query')
const suggestEl = $('#suggest')
const examplesEl = $('#examples')
const errorEl = $('#error')
const statusEl = $('#status')
const resultEl = $('#result')

// ── theme ──────────────────────────────────────────────────────────────
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
let dark = prefersDark.matches

// ── discovery host (result renderer) ──────────────────────────────────
// Map discovery's custom props onto the prototype chrome palette so the
// panel follows the same light/dark scheme — the "themed discovery inside
// devframe chrome" decision under test.
const themeBridge = `
  :host {
    --discovery-background-color: var(--proto-bg);
    --discovery-color: var(--proto-color);
    font-family: ui-monospace, 'DM Mono', monospace;
  }
`
const host = new ViewModel({
  container: resultEl,
  styles: [discoveryCss, themeBridge],
  colorScheme: dark ? 'dark' : 'light',
  colorSchemePersistent: false,
})
await host.dom.ready

function applyTheme(): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
  host.colorScheme.set(dark ? 'dark' : 'light')
}
$('#theme').addEventListener('click', () => {
  dark = !dark
  applyTheme()
})
applyTheme()

function syncPanelVars(): void {
  // Custom props inherit through shadow boundaries — set them on the host el.
  const styles = getComputedStyle(document.body)
  resultEl.style.setProperty('--proto-bg', styles.getPropertyValue('background-color'))
  resultEl.style.setProperty('--proto-color', styles.getPropertyValue('color'))
}
new MutationObserver(syncPanelVars).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
syncPanelVars()

async function renderResult(outcome: QueryOutcome, roundTripMs: number): Promise<void> {
  errorEl.style.display = 'none'
  if (!outcome.ok) {
    errorEl.textContent = `${outcome.error.name}: ${outcome.error.message}`
    errorEl.style.display = 'block'
    statusEl.textContent = 'query failed'
    return
  }
  const { queryMs, normalize } = outcome.stats
  statusEl.textContent
    = `rpc ${roundTripMs.toFixed(0)}ms · jora ${queryMs}ms · normalize ${normalize.ms}ms · ${normalize.nodes} nodes${normalize.refs ? ` · ${normalize.refs} $refs` : ''}`
  host.dom.pageContent.replaceChildren()
  await host.view.render(
    host.dom.pageContent,
    { view: 'struct', expanded: 2 },
    outcome.result,
    {},
  )
}

// ── rpc ────────────────────────────────────────────────────────────────
const rpc = await connectDevframe({ baseURL: '/' })
await rpc.ensureTrusted(10_000)
statusEl.textContent = 'connected'

// Prototype functions are not module-augmented into DevframeRpcServerFunctions.
const call = rpc.call as unknown as (name: string, ...args: unknown[]) => Promise<unknown>

const sources = await call('data-viewer-proto:sources') as SourceMeta[]
for (const s of sources) {
  const opt = document.createElement('option')
  opt.value = s.id
  opt.textContent = s.label
  sourceEl.append(opt)
}

function renderExamples(): void {
  const source = sources.find(s => s.id === sourceEl.value)
  examplesEl.replaceChildren()
  for (const example of source?.examples ?? []) {
    const chip = document.createElement('button')
    chip.textContent = example
    chip.addEventListener('click', () => {
      queryEl.value = example
      void runQuery()
    })
    examplesEl.append(chip)
  }
}
sourceEl.addEventListener('change', renderExamples)
renderExamples()

async function runQuery(): Promise<void> {
  hideSuggest()
  statusEl.textContent = 'running…'
  const started = performance.now()
  const outcome = await call('data-viewer-proto:query', sourceEl.value, queryEl.value) as QueryOutcome
  await renderResult(outcome, performance.now() - started)
}
$('#run').addEventListener('click', () => void runQuery())

// ── remote suggestions ─────────────────────────────────────────────────
let items: SuggestItem[] = []
let active = 0
let suggestSeq = 0

function hideSuggest(): void {
  suggestEl.style.display = 'none'
  items = []
}

function acceptSuggestion(item: SuggestItem): void {
  const text = queryEl.value
  queryEl.value = text.slice(0, item.from) + item.value + text.slice(item.to)
  const caret = item.from + item.value.length
  queryEl.setSelectionRange(caret, caret)
  queryEl.focus()
  hideSuggest()
}

function showSuggest(list: SuggestItem[]): void {
  items = list
  active = 0
  if (!list.length) {
    hideSuggest()
    return
  }
  suggestEl.replaceChildren()
  list.forEach((item, i) => {
    const row = document.createElement('div')
    row.className = `item${i === active ? ' active' : ''}`
    row.innerHTML = `<span class="value"></span><span class="type"></span>`
    ;(row.querySelector('.value') as HTMLElement).textContent = item.value
    ;(row.querySelector('.type') as HTMLElement).textContent = item.type
    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      acceptSuggestion(item)
    })
    suggestEl.append(row)
  })
  suggestEl.style.display = 'block'
}

async function requestSuggestions(): Promise<void> {
  const seq = ++suggestSeq
  const pos = queryEl.selectionStart ?? queryEl.value.length
  const out = await call('data-viewer-proto:suggest', sourceEl.value, queryEl.value, pos) as SuggestOutcome
  if (seq !== suggestSeq)
    return // a newer request superseded this one
  showSuggest(out.ok ? out.suggestions : [])
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined
queryEl.addEventListener('input', () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void requestSuggestions(), 150)
})

queryEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    void runQuery()
    return
  }
  if (e.ctrlKey && e.key === ' ') {
    e.preventDefault()
    void requestSuggestions()
    return
  }
  if (items.length === 0)
    return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
    suggestEl.querySelectorAll('.item').forEach((el, i) => el.classList.toggle('active', i === active))
  }
  else if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault()
    acceptSuggestion(items[active])
  }
  else if (e.key === 'Escape') {
    hideSuggest()
  }
})
queryEl.addEventListener('blur', () => setTimeout(hideSuggest, 150))

// Auto-run the first example so the page lands on a rendered result.
queryEl.value = 'config.plugins.name'
void runQuery()
