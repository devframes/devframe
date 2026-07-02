import type { Impact } from '../shared/protocol.ts'
import { createMemo, createSignal, Match, Show, Switch } from 'solid-js'
import { emptyCounts } from '../shared/protocol.ts'
import { Header, MetaLine, Summary } from './components/header.tsx'
import { CheckCircle, PlugIcon } from './components/icons.tsx'
import { ViolationList } from './components/violations.tsx'
import { createA11yChannel } from './lib/channel.ts'
import { connectDevframeState } from './lib/devframe.ts'
import { IMPACT_LABEL } from './lib/impact.ts'

const SNIPPET = '<script type="module" src="…/inject.js"></script>'

export function App() {
  const channel = createA11yChannel()
  const devframe = connectDevframeState()

  const [filter, setFilter] = createSignal<Impact | null>(null)
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set())

  const counts = () => channel.report()?.counts ?? emptyCounts()
  const violations = () => channel.report()?.violations ?? []
  const total = () => violations().length
  const filtered = createMemo(() => {
    const active = filter()
    return active ? violations().filter(v => v.impact === active) : violations()
  })

  function toggleFilter(impact: Impact) {
    setFilter(prev => (prev === impact ? null : impact))
  }
  function toggleExpand(ruleId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId))
        next.delete(ruleId)
      else
        next.add(ruleId)
      return next
    })
  }

  const announce = () => {
    if (!channel.report())
      return channel.scanning() ? 'Scanning the page' : ''
    return `${total()} accessibility ${total() === 1 ? 'issue' : 'issues'} found`
  }

  return (
    <div class="app">
      <Header
        agentReady={channel.agentReady()}
        scanning={channel.scanning()}
        onRescan={channel.rescan}
      />
      <MetaLine report={channel.report} backend={devframe.backend} />

      <Show when={channel.report() && total() > 0}>
        <Summary counts={counts()} active={filter()} onToggle={toggleFilter} />
      </Show>

      <p class="visually-hidden" aria-live="polite">{announce()}</p>

      <div class="scroll">
        <Switch>
          {/* No agent has announced itself on this origin yet. */}
          <Match when={!channel.report() && !channel.agentReady()}>
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

          {/* Agent present, first report not in yet. */}
          <Match when={!channel.report()}>
            <div class="state">
              <PlugIcon class="state__glyph" />
              <p class="state__title">Scanning the page…</p>
              <p class="state__body">Running axe-core against the connected document.</p>
            </div>
          </Match>

          {/* Report in, zero violations. */}
          <Match when={total() === 0}>
            <div class="state state--clean">
              <CheckCircle class="state__glyph" />
              <p class="state__title">No WCAG A &amp; AA violations</p>
              <p class="state__body">
                axe-core found nothing to flag on this page. Re-run after changes
                to keep it that way.
              </p>
            </div>
          </Match>

          {/* Filter active but empty for that impact. */}
          <Match when={filtered().length === 0}>
            <div class="state">
              <CheckCircle class="state__glyph" />
              <p class="state__title">
                No
                {' '}
                {filter() ? IMPACT_LABEL[filter()!] : ''}
                {' '}
                issues
              </p>
              <p class="state__body">
                {total()}
                {' '}
                {total() === 1 ? 'issue' : 'issues'}
                {' '}
                at other severities. Clear the filter to see them.
              </p>
            </div>
          </Match>

          {/* The list. */}
          <Match when={filtered().length > 0}>
            <ViolationList
              violations={filtered()}
              expanded={expanded()}
              onToggle={toggleExpand}
              channel={channel}
            />
          </Match>
        </Switch>
      </div>
    </div>
  )
}
