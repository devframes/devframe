import type { Impact } from '../../shared/protocol.ts'
import { Summary } from './header.tsx'

interface SummaryBarProps {
  counts: Record<Impact, number>
  filter: Impact | null
  onToggleFilter: (impact: Impact) => void
  totalNodes: number
  totalRules: number
  routeCount: number
  autoScan: boolean
  onToggleAutoScan: (enabled: boolean) => void
  showBestPractice: boolean
  onToggleBestPractice: (show: boolean) => void
  onClearAll: () => void
}

/**
 * The compact summary band that heads the single-page panel: the severity
 * chips (doubling as the impact filter), a one-line count, and the scan /
 * best-practice / clear controls.
 */
export function SummaryBar(props: SummaryBarProps) {
  return (
    <div class="summary-bar">
      <Summary counts={props.counts} active={props.filter} onToggle={props.onToggleFilter} />

      <div class="summary-bar__toolbar">
        <span class="summary-bar__stat">
          {props.totalNodes}
          {' '}
          {props.totalNodes === 1 ? 'issue' : 'issues'}
          {' · '}
          {props.totalRules}
          {' '}
          {props.totalRules === 1 ? 'rule' : 'rules'}
          {' · '}
          {props.routeCount}
          {' '}
          {props.routeCount === 1 ? 'route' : 'routes'}
        </span>

        <span class="flex-1" />

        <label class="switch">
          <input
            type="checkbox"
            checked={props.showBestPractice}
            onChange={e => props.onToggleBestPractice(e.currentTarget.checked)}
          />
          <span class="switch__track"><span class="switch__thumb" /></span>
          <span class="switch__label">Best-practice</span>
        </label>

        <label class="switch">
          <input
            type="checkbox"
            checked={props.autoScan}
            onChange={e => props.onToggleAutoScan(e.currentTarget.checked)}
          />
          <span class="switch__track"><span class="switch__thumb" /></span>
          <span class="switch__label">Auto-scan</span>
        </label>

        <button
          type="button"
          class="summary-bar__clear"
          disabled={props.routeCount === 0}
          onClick={() => props.onClearAll()}
          title="Clear all tracked routes"
        >
          <span aria-hidden class="i-ph-trash-duotone shrink-0" />
          Clear
        </button>
      </div>
    </div>
  )
}
