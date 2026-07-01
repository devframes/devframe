import type { Accessor } from 'solid-js'
import type { Impact, ScanReport } from '../../shared/protocol.ts'
import { For, Show } from 'solid-js'
import { IMPACT_ORDER } from '../../shared/protocol.ts'
import { button, nav, navBrand } from '../design'
import { IMPACT_COLOR, IMPACT_LABEL } from '../lib/impact.ts'

interface HeaderProps {
  agentReady: boolean
  scanning: boolean
  onRescan: () => void
}

export function Header(props: HeaderProps) {
  const statusLabel = () =>
    !props.agentReady ? 'No page connected' : props.scanning ? 'Scanning…' : 'Connected'
  const dotClass = () =>
    !props.agentReady
      ? 'status__dot'
      : props.scanning
        ? 'status__dot status__dot--scanning'
        : 'status__dot status__dot--live'

  return (
    <header class={nav()}>
      <span class={navBrand()}>
        <span class="i-ph-person-arms-spread-duotone text-base color-active" />
        <span>A11y Inspector</span>
      </span>
      <span class="flex-1" />
      <span class="status">
        <span class={dotClass()} />
        {statusLabel()}
      </span>
      <button
        type="button"
        class={button({ variant: 'primary', size: 'sm' })}
        onClick={() => props.onRescan()}
        disabled={!props.agentReady || props.scanning}
      >
        <span class="i-ph-arrows-clockwise" classList={{ 'animate-spin': props.scanning }} />
        Rescan
      </button>
    </header>
  )
}

export function MetaLine(props: { report: Accessor<ScanReport | null>, backend: Accessor<string | null> }) {
  return (
    <Show when={props.report()}>
      {report => (
        <div class="meta">
          <span class="meta__url" title={report().url}>{report().url}</span>
          <Show when={props.backend()}>
            {b => <span class="meta__tag">{b()}</span>}
          </Show>
          <span class="meta__tag">
            axe
            {' '}
            {report().engine}
          </span>
        </div>
      )}
    </Show>
  )
}

interface SummaryProps {
  counts: Record<Impact, number>
  active: Impact | null
  onToggle: (impact: Impact) => void
}

export function Summary(props: SummaryProps) {
  return (
    <div class="summary">
      <For each={IMPACT_ORDER}>
        {(impact) => {
          const count = () => props.counts[impact]
          return (
            <button
              type="button"
              class={`chip${count() === 0 ? ' chip--zero' : ''}`}
              style={{ '--impact': IMPACT_COLOR[impact] }}
              aria-pressed={props.active === impact}
              aria-label={`${count()} ${IMPACT_LABEL[impact]} issues — filter`}
              onClick={() => props.onToggle(impact)}
            >
              <span class="chip__count">{count()}</span>
              <span class="chip__label">{IMPACT_LABEL[impact]}</span>
            </button>
          )
        }}
      </For>
    </div>
  )
}
