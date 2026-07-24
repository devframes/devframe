import type { Impact } from '../../shared/protocol.ts'
import { For, Show } from 'solid-js'
import { Summary } from './header.tsx'

export interface RouteSummary {
  route: string
  active: boolean
  ruleCount: number
  nodeCount: number
}

interface DashboardProps {
  counts: Record<Impact, number>
  filter: Impact | null
  onToggleFilter: (impact: Impact) => void
  totalNodes: number
  totalRules: number
  routes: RouteSummary[]
  onSelectRoute: (route: string) => void
  autoScan: boolean
  onToggleAutoScan: (enabled: boolean) => void
  showBestPractice: boolean
  onToggleBestPractice: (show: boolean) => void
  onClearAll: () => void
}

export function Dashboard(props: DashboardProps) {
  return (
    <div class="dash">
      <div class="dash__totals">
        <div class="stat">
          <span class="stat__num">{props.totalNodes}</span>
          <span class="stat__label">Affected elements</span>
        </div>
        <div class="stat">
          <span class="stat__num">{props.totalRules}</span>
          <span class="stat__label">Rules violated</span>
        </div>
        <div class="stat">
          <span class="stat__num">{props.routes.length}</span>
          <span class="stat__label">Routes tracked</span>
        </div>
      </div>

      <Summary counts={props.counts} active={props.filter} onToggle={props.onToggleFilter} />

      <div class="dash__controls">
        <label class="switch">
          <input
            type="checkbox"
            checked={props.autoScan}
            onChange={e => props.onToggleAutoScan(e.currentTarget.checked)}
          />
          <span class="switch__track"><span class="switch__thumb" /></span>
          <span class="switch__label">Auto-scan on interaction</span>
        </label>

        <label class="switch">
          <input
            type="checkbox"
            checked={props.showBestPractice}
            onChange={e => props.onToggleBestPractice(e.currentTarget.checked)}
          />
          <span class="switch__track"><span class="switch__thumb" /></span>
          <span class="switch__label">Show best-practice</span>
        </label>

        <span class="flex-1" />

        <button
          type="button"
          class="dash__clear"
          disabled={props.routes.length === 0}
          onClick={() => props.onClearAll()}
        >
          <span class="i-ph-trash-duotone" />
          Clear all
        </button>
      </div>

      <div class="dash__routes">
        <p class="dash__routes-title">Routes</p>
        <Show
          when={props.routes.length > 0}
          fallback={<p class="dash__empty">No routes scanned yet.</p>}
        >
          <ul class="routes">
            <For each={props.routes}>
              {r => (
                <li>
                  <button
                    type="button"
                    class="route"
                    classList={{ 'route--active': r.active }}
                    onClick={() => props.onSelectRoute(r.route)}
                  >
                    <code class="route__path">{r.route}</code>
                    <Show when={r.active}>
                      <span class="route__active">active</span>
                    </Show>
                    <span class="flex-1" />
                    <span class="route__count" classList={{ 'route__count--clean': r.nodeCount === 0 }}>
                      {r.nodeCount}
                      {' '}
                      {r.nodeCount === 1 ? 'issue' : 'issues'}
                    </span>
                    <span class="i-ph-caret-right route__go" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  )
}
