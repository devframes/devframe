import type { Impact } from '../../shared/protocol.ts'
import { Show } from 'solid-js'
import { Summary } from './Summary.tsx'
import { Switch } from './Switch.tsx'

interface SummaryBarProps {
  counts: Record<Impact, number>
  filter: Impact | null
  onToggleFilter: (impact: Impact) => void
  onHoverImpact: (impact: Impact | null) => void
  totalNodes: number
  totalRules: number
  routeCount: number
  /** Number of violations currently selected. */
  selectedCount: number
  /** Whether every currently-visible violation is selected. */
  allSelected: boolean
  /** Select all visible violations. */
  onSelectAll: () => void
  /** Invert the selection across the visible violations. */
  onInvertSelection: () => void
  /** Clear the entire selection (including any hidden by the filter). */
  onClearSelection: () => void
  autoScan: boolean
  onToggleAutoScan: (enabled: boolean) => void
  showBestPractice: boolean
  onToggleBestPractice: (show: boolean) => void
  onClearAll: () => void
}

const ACTION = 'inline-flex items-center gap-1.5 text-xs color-muted bg-secondary border border-base rounded-md px-2.5 py-1 cursor-pointer transition hover:bg-active outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:op-40 disabled:cursor-default'

/**
 * The compact, sticky summary band that heads the single-page panel: the
 * severity chips (doubling as the impact filter), a one-line count, bulk
 * selection actions, and the scan / best-practice / clear controls.
 */
export function SummaryBar(props: SummaryBarProps) {
  const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`
  return (
    <div class="flex flex-col gap-2 pt-3 pb-2.5 sticky top-0 z-[2] bg-base">
      <Summary counts={props.counts} active={props.filter} onToggle={props.onToggleFilter} onHover={props.onHoverImpact} />

      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-[11.5px] color-muted tabular-nums">
          {plural(props.totalNodes, 'issue')}
          {' · '}
          {plural(props.totalRules, 'rule')}
          {' · '}
          {plural(props.routeCount, 'route')}
        </span>

        <button
          type="button"
          class={ACTION}
          onClick={() => props.onSelectAll()}
          disabled={props.allSelected}
          title="Select all visible violations"
        >
          <span aria-hidden class="i-ph-check-square-duotone shrink-0" />
          Select all
        </button>

        <button
          type="button"
          class={ACTION}
          onClick={() => props.onInvertSelection()}
          title="Invert the selection across the visible violations"
        >
          <span aria-hidden class="i-ph-selection-inverse-duotone shrink-0" />
          Invert
        </button>

        <Show when={props.selectedCount > 0}>
          <button
            type="button"
            class={ACTION}
            onClick={() => props.onClearSelection()}
            title="Clear the whole selection"
          >
            <span aria-hidden class="i-ph-x shrink-0" />
            Clear selection
            <span class="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-active text-[10px] font-bold tabular-nums">{props.selectedCount}</span>
          </button>
        </Show>

        <span class="flex-1" />

        <Switch label="Best-practice" checked={props.showBestPractice} onChange={props.onToggleBestPractice} />
        <Switch label="Auto-scan" checked={props.autoScan} onChange={props.onToggleAutoScan} />

        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-xs color-muted bg-secondary border border-base rounded-md px-2.5 py-1 cursor-pointer transition hover:text-error hover:border-error/50 disabled:op-40 disabled:cursor-default"
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
