import type { Impact, PinTarget, Violation, ViolationNode } from '../shared/protocol.ts'
import type { SelectedItem } from './lib/fix-prompt.ts'
import type { RouteGroupModel, SelectionApi } from './lib/violation-view.ts'
import { batch, createEffect, createMemo, createSignal, Match, on, Show, Switch } from 'solid-js'
import { emptyCounts } from '../shared/protocol.ts'
import { EmptyState } from './components/EmptyState.tsx'
import { FixPromptsDialog } from './components/FixPromptsDialog.tsx'
import { Header } from './components/Header.tsx'
import { MetaLine } from './components/MetaLine.tsx'
import { SummaryBar } from './components/SummaryBar.tsx'
import { ViolationList } from './components/ViolationList.tsx'
import { createA11yChannel } from './lib/channel.ts'
import { connectDevframeState } from './lib/devframe.ts'
import { ruleCardId } from './lib/violation-view.ts'

const SNIPPET = '<script type="module" src="…/inject.js"></script>'
const AUTOSCAN_KEY = 'devframes:plugin:a11y:autoscan'

const selKey = (route: string, ruleId: string) => `${route}::${ruleId}`
function nodePin(v: Violation, node: ViolationNode): PinTarget {
  return { nodeId: node.id, target: node.target, impact: v.impact, ruleId: v.ruleId }
}

export function App() {
  const channel = createA11yChannel()
  const devframe = connectDevframeState()

  const [filter, setFilter] = createSignal<Impact | null>(null)
  const [showBestPractice, setShowBestPractice] = createSignal(true)
  const [expandedRoutes, setExpandedRoutes] = createSignal<Set<string>>(new Set())
  const [expandedRules, setExpandedRules] = createSignal<Set<string>>(new Set())
  // Selected violations (`route::ruleId`) — drives both the in-page highlight
  // and the "Generate fix prompts" dialog.
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = createSignal(false)
  // Transient severity preview: hovering a summary chip lights up every element
  // of that impact, overriding the selection highlight until the hover ends.
  const [hoverImpact, setHoverImpact] = createSignal<Impact | null>(null)

  const storedAuto = (() => {
    try {
      return sessionStorage.getItem(AUTOSCAN_KEY)
    }
    catch {
      return null
    }
  })()
  const [autoScan, setAutoScan] = createSignal(storedAuto == null ? true : storedAuto === '1')

  const routes = () => channel.state()?.routes ?? []
  const activeRoute = () => channel.activeRoute()
  const activeReport = createMemo(() => routes().find(r => r.route === activeRoute()) ?? null)
  const engine = () => channel.state()?.engine

  const includeViolation = (v: Violation) => showBestPractice() || !v.bestPractice
  const matchFilter = (v: Violation) => filter() === null || v.impact === filter()

  // Chip counts respect the best-practice toggle but not the impact filter, so
  // the chips can drive the filter.
  const chipCounts = createMemo(() => {
    const counts = emptyCounts()
    for (const report of routes()) {
      for (const v of report.violations) {
        if (!includeViolation(v))
          continue
        counts[v.impact] += v.nodes.length
      }
    }
    return counts
  })

  const totalNodes = createMemo(() =>
    routes().reduce((n, r) => n + r.violations.filter(includeViolation).reduce((m, v) => m + v.nodes.length, 0), 0))
  const totalRules = createMemo(() =>
    routes().reduce((n, r) => n + r.violations.filter(includeViolation).length, 0))

  // Grouped, filtered violations — active route first, empty groups dropped.
  const groups = createMemo<RouteGroupModel[]>(() => {
    const models = routes().map(r => ({
      report: r,
      active: r.route === activeRoute(),
      violations: r.violations.filter(v => includeViolation(v) && matchFilter(v)),
    })).filter(g => g.violations.length > 0)
    models.sort((a, b) => Number(b.active) - Number(a.active))
    return models
  })

  const shownViolations = createMemo(() => groups().reduce((n, g) => n + g.violations.length, 0))
  const totalFilterable = createMemo(() =>
    routes().reduce((n, r) => n + r.violations.filter(includeViolation).length, 0))

  const collapsedRoutes = createMemo(() => {
    const collapsed = new Set<string>()
    for (const r of routes()) {
      if (!expandedRoutes().has(r.route))
        collapsed.add(r.route)
    }
    return collapsed
  })

  // ── selection → highlight + fix-prompt context ────────────────────────────
  // Highlighted nodes, in a stable order, for numbered badges.
  const selectedPins = createMemo<PinTarget[]>(() => {
    const sel = selected()
    const out: PinTarget[] = []
    for (const report of routes()) {
      for (const v of report.violations) {
        if (sel.has(selKey(report.route, v.ruleId))) {
          for (const node of v.nodes)
            out.push(nodePin(v, node))
        }
      }
    }
    return out
  })

  // Every element of a given impact (across routes), for the chip-hover preview.
  const impactPins = (impact: Impact): PinTarget[] => {
    const out: PinTarget[] = []
    for (const report of routes()) {
      for (const v of report.violations) {
        if (includeViolation(v) && v.impact === impact) {
          for (const node of v.nodes)
            out.push(nodePin(v, node))
        }
      }
    }
    return out
  }

  const selectedItems = createMemo<SelectedItem[]>(() => {
    const sel = selected()
    const out: SelectedItem[] = []
    for (const report of routes()) {
      for (const v of report.violations) {
        if (sel.has(selKey(report.route, v.ruleId)))
          out.push({ route: report.route, url: report.url, violation: v })
      }
    }
    return out
  })

  // Keys of the currently-visible (filtered) violations, for bulk selection.
  const visibleKeys = createMemo(() =>
    groups().flatMap(g => g.violations.map(v => selKey(g.report.route, v.ruleId))))
  const allVisibleSelected = createMemo(() => {
    const keys = visibleKeys()
    return keys.length > 0 && keys.every(k => selected().has(k))
  })

  // Select all / unselect all — toggles the whole visible set at once.
  function toggleSelectAll() {
    const keys = visibleKeys()
    if (keys.length === 0)
      return
    const allSel = keys.every(k => selected().has(k))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const k of keys) {
        if (allSel)
          next.delete(k)
        else
          next.add(k)
      }
      return next
    })
  }
  // Clear the entire selection, including any hidden by the current filter.
  function clearSelection() {
    setSelected(new Set<string>())
  }

  const selectionApi: SelectionApi = {
    isSelected: (route, ruleId) => selected().has(selKey(route, ruleId)),
    toggle: (route, ruleId) => {
      const key = selKey(route, ruleId)
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(key))
          next.delete(key)
        else
          next.add(key)
        return next
      })
    },
    numberOf: (nodeId) => {
      const i = selectedPins().findIndex(p => p.nodeId === nodeId)
      return i === -1 ? null : i + 1
    },
  }

  // ── config → agent, and initial auto-scan default ─────────────────────────
  let autoInit = false
  createEffect(() => {
    const cfg = devframe.config()
    if (!cfg)
      return
    channel.sendConfig(cfg.agent)
    if (!autoInit && storedAuto == null) {
      autoInit = true
      setAutoScan(cfg.agent.autoScan)
    }
  })

  createEffect(on(autoScan, (v) => {
    channel.setAutoScan(v)
    try {
      sessionStorage.setItem(AUTOSCAN_KEY, v ? '1' : '0')
    }
    catch {
      // best-effort
    }
  }))

  // Keep the active route's group expanded.
  createEffect(() => {
    const r = activeRoute()
    if (r)
      setExpandedRoutes(prev => (prev.has(r) ? prev : new Set(prev).add(r)))
  })

  // Push the highlight set to the in-page agent: the hovered impact's elements
  // while a summary chip is hovered, otherwise the selection.
  createEffect(() => {
    const hov = hoverImpact()
    channel.setPins(hov ? impactPins(hov) : selectedPins())
  })

  // defaultHighlight: select all of a route's violations the first time it's scanned.
  const highlighted = new Set<string>()
  createEffect(() => {
    const cfg = devframe.config()
    const report = activeReport()
    if (!cfg?.defaultHighlight || !report || highlighted.has(report.route))
      return
    highlighted.add(report.route)
    setSelected((prev) => {
      const next = new Set(prev)
      for (const v of report.violations)
        next.add(selKey(report.route, v.ruleId))
      return next
    })
  })

  // ── deep-linking from other docks (e.g. the messages feed) ────────────────
  createEffect(on(devframe.activation, (act) => {
    if (!act)
      return
    const cfg = devframe.config()
    if (cfg && act.dockId !== cfg.dockId)
      return
    const params = act.params ?? {}
    const route = typeof params.route === 'string' ? params.route : undefined
    const ruleId = typeof params.ruleId === 'string' ? params.ruleId : undefined

    // A dashboard/summary activation (or one with no target) just scrolls to top.
    if (params.tab === 'dashboard' || !route) {
      document.querySelector('#a11y-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    batch(() => {
      setExpandedRoutes(prev => new Set(prev).add(route))
      if (ruleId) {
        setExpandedRules(prev => new Set(prev).add(`${route}::${ruleId}`))
        setSelected(prev => new Set(prev).add(selKey(route, ruleId)))
      }
    })
    if (ruleId)
      setTimeout(() => document.getElementById(ruleCardId(route, ruleId))?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
  }, { defer: true }))

  function toggleFilter(impact: Impact) {
    setFilter(prev => (prev === impact ? null : impact))
  }
  function toggleGroup(route: string) {
    setExpandedRoutes((prev) => {
      const next = new Set(prev)
      if (next.has(route))
        next.delete(route)
      else
        next.add(route)
      return next
    })
  }
  function toggleRule(route: string, ruleId: string) {
    const key = `${route}::${ruleId}`
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(key))
        next.delete(key)
      else
        next.add(key)
      return next
    })
  }

  const announce = () => {
    if (!channel.state())
      return channel.scanning() ? 'Scanning the page' : ''
    return `${totalNodes()} accessibility ${totalNodes() === 1 ? 'issue' : 'issues'} found across ${routes().length} ${routes().length === 1 ? 'route' : 'routes'}`
  }

  return (
    <div class="flex flex-col h-full min-h-0 bg-base color-base font-sans">
      <Header
        agentReady={channel.agentReady()}
        scanning={channel.scanning()}
        selectedCount={selectedItems().length}
        onGenerate={() => setDialogOpen(true)}
        onRescan={channel.rescan}
      />
      <MetaLine
        url={activeReport()?.url}
        engine={engine()}
        backend={devframe.backend}
        status={devframe.status}
      />

      <p class="sr-only" aria-live="polite">{announce()}</p>

      <div id="a11y-scroll" class="a11y-scroll flex-1 min-h-0 overflow-y-auto px-4 pb-5">
        <Switch>
          {/* No agent has announced itself on this origin yet. */}
          <Match when={!channel.state() && !channel.agentReady()}>
            <EmptyState
              icon="i-ph-plugs-duotone text-4xl"
              title="No page connected"
              body="Load the inspector agent in the app you want to check, then this panel will list its accessibility issues live."
              code={SNIPPET}
            />
          </Match>

          {/* Agent present, first state not in yet. */}
          <Match when={!channel.state()}>
            <EmptyState
              icon="i-ph-plugs-duotone text-4xl"
              title="Scanning the page…"
              body="Running axe-core against the connected document."
            />
          </Match>

          {/* Report in, nothing to flag. */}
          <Match when={totalFilterable() === 0}>
            <EmptyState
              clean
              icon="i-ph-check-circle-duotone text-4xl"
              title="No violations"
              body="axe-core found nothing to flag across the tracked routes. Re-run after changes to keep it that way."
            />
          </Match>

          {/* Single page: summary band + grouped violations. */}
          <Match when={totalFilterable() > 0}>
            <SummaryBar
              counts={chipCounts()}
              filter={filter()}
              onToggleFilter={toggleFilter}
              onHoverImpact={setHoverImpact}
              totalNodes={totalNodes()}
              totalRules={totalRules()}
              routeCount={routes().length}
              selectedCount={selectedItems().length}
              allSelected={allVisibleSelected()}
              onToggleSelectAll={toggleSelectAll}
              onClearSelection={clearSelection}
              autoScan={autoScan()}
              onToggleAutoScan={setAutoScan}
              showBestPractice={showBestPractice()}
              onToggleBestPractice={setShowBestPractice}
              onClearAll={channel.clearAll}
            />

            <Show
              when={shownViolations() > 0}
              fallback={(
                <EmptyState
                  clean
                  icon="i-ph-check-circle-duotone text-4xl"
                  title="Nothing matches the filter"
                  body={(
                    <>
                      {totalFilterable()}
                      {' '}
                      {totalFilterable() === 1 ? 'rule' : 'rules'}
                      {' at other severities. Clear the filter to see them.'}
                    </>
                  )}
                />
              )}
            >
              <ViolationList
                groups={groups()}
                collapsedRoutes={collapsedRoutes()}
                onToggleGroup={toggleGroup}
                onClearRoute={channel.clearRoute}
                expandedRules={expandedRules()}
                onToggleRule={toggleRule}
                channel={channel}
                selection={selectionApi}
              />
            </Show>
          </Match>
        </Switch>
      </div>

      <Show when={dialogOpen() && selectedItems().length > 0}>
        <FixPromptsDialog items={selectedItems()} onClose={() => setDialogOpen(false)} />
      </Show>
    </div>
  )
}
