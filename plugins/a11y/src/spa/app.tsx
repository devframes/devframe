import type { Impact, PinTarget, Violation, ViolationNode } from '../shared/protocol.ts'
import type { SelectedItem } from './components/fix-prompts.tsx'
import type { RouteGroupModel, SelectionApi } from './components/violations.tsx'
import { batch, createEffect, createMemo, createSignal, Match, on, Show, Switch } from 'solid-js'
import { emptyCounts } from '../shared/protocol.ts'
import { FixPromptsDialog } from './components/fix-prompts.tsx'
import { Header, MetaLine } from './components/header.tsx'
import { CheckCircle, PlugIcon } from './components/icons.tsx'
import { SummaryBar } from './components/summary.tsx'
import { ruleCardId, ViolationList } from './components/violations.tsx'
import { createA11yChannel } from './lib/channel.ts'
import { connectDevframeState } from './lib/devframe.ts'

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

  // Push the highlight set (derived from the selection) to the in-page agent.
  createEffect(() => channel.setPins(selectedPins()))

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
      document.querySelector('.scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
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
    <div class="app">
      <Header
        agentReady={channel.agentReady()}
        scanning={channel.scanning()}
        selectedCount={selectedItems().length}
        onGenerate={() => setDialogOpen(true)}
        onRescan={channel.rescan}
      />
      <MetaLine
        url={activeReport()?.url}
        route={activeReport()?.route}
        engine={engine()}
        backend={devframe.backend}
        status={devframe.status}
      />

      <p class="visually-hidden" aria-live="polite">{announce()}</p>

      <div class="scroll">
        <Switch>
          {/* No agent has announced itself on this origin yet. */}
          <Match when={!channel.state() && !channel.agentReady()}>
            <div class="state">
              <PlugIcon class="state__glyph" />
              <p class="state__title">No page connected</p>
              <p class="state__body">
                Load the inspector agent in the app you want to check, then this
                panel will list its accessibility issues live.
              </p>
              <code class="state__code">{SNIPPET}</code>
            </div>
          </Match>

          {/* Agent present, first state not in yet. */}
          <Match when={!channel.state()}>
            <div class="state">
              <PlugIcon class="state__glyph" />
              <p class="state__title">Scanning the page…</p>
              <p class="state__body">Running axe-core against the connected document.</p>
            </div>
          </Match>

          {/* Report in, nothing to flag. */}
          <Match when={totalFilterable() === 0}>
            <div class="state state--clean">
              <CheckCircle class="state__glyph" />
              <p class="state__title">No violations</p>
              <p class="state__body">
                axe-core found nothing to flag across the tracked routes. Re-run
                after changes to keep it that way.
              </p>
            </div>
          </Match>

          {/* Single page: summary band + grouped violations. */}
          <Match when={totalFilterable() > 0}>
            <SummaryBar
              counts={chipCounts()}
              filter={filter()}
              onToggleFilter={toggleFilter}
              totalNodes={totalNodes()}
              totalRules={totalRules()}
              routeCount={routes().length}
              autoScan={autoScan()}
              onToggleAutoScan={setAutoScan}
              showBestPractice={showBestPractice()}
              onToggleBestPractice={setShowBestPractice}
              onClearAll={channel.clearAll}
            />

            <Show
              when={shownViolations() > 0}
              fallback={(
                <div class="state">
                  <CheckCircle class="state__glyph" />
                  <p class="state__title">Nothing matches the filter</p>
                  <p class="state__body">
                    {totalFilterable()}
                    {' '}
                    {totalFilterable() === 1 ? 'rule' : 'rules'}
                    {' at other severities. Clear the filter to see them.'}
                  </p>
                </div>
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
