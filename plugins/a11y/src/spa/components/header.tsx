import type { Impact } from '../../shared/protocol.ts'
import { For, Show } from 'solid-js'
import { button, nav, navBrand, tab, tabsList } from '../design'
import { IMPACT_COLOR, IMPACT_LABEL } from '../lib/impact.ts'

export type TabId = 'dashboard' | 'violations'

interface HeaderProps {
  agentReady: boolean
  scanning: boolean
  activeTab: TabId
  onTab: (tab: TabId) => void
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

  const tabs: { id: TabId, label: string, icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'i-ph-gauge-duotone' },
    { id: 'violations', label: 'Violations', icon: 'i-ph-list-checks-duotone' },
  ]

  return (
    <header class={nav()}>
      <span class={navBrand()}>
        <span class="i-ph-person-arms-spread-duotone text-base color-active" />
        <span>A11y Inspector</span>
      </span>

      <div class={tabsList('ml-2')} role="tablist">
        <For each={tabs}>
          {t => (
            <button
              type="button"
              role="tab"
              class={tab()}
              data-state={props.activeTab === t.id ? 'active' : 'inactive'}
              aria-selected={props.activeTab === t.id}
              onClick={() => props.onTab(t.id)}
            >
              <span class={t.icon} />
              {t.label}
            </button>
          )}
        </For>
      </div>

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

interface MetaLineProps {
  url?: string
  route?: string
  engine?: string
  backend: () => string | null
  status?: () => string | null
}

export function MetaLine(props: MetaLineProps) {
  // The backend is optional here, so a degraded connection is shown as a quiet
  // tag rather than taking over the panel.
  const degraded = () => {
    const s = props.status?.()
    return s === 'disconnected' || s === 'unauthorized' || s === 'error' ? s : null
  }
  return (
    <Show when={props.url}>
      <div class="meta">
        <span class="meta__url" title={props.url}>{props.url}</span>
        <Show when={degraded()} fallback={<Show when={props.backend()}>{b => <span class="meta__tag">{b()}</span>}</Show>}>
          {s => <span class="meta__tag meta__tag--warn" title="devframe backend connection">{s()}</span>}
        </Show>
        <Show when={props.engine}>
          <span class="meta__tag">
            axe
            {' '}
            {props.engine}
          </span>
        </Show>
      </div>
    </Show>
  )
}

interface SummaryProps {
  counts: Record<Impact, number>
  active: Impact | null
  onToggle: (impact: Impact) => void
}

/** The severity summary chips — also serve as the impact filter. */
export function Summary(props: SummaryProps) {
  return (
    <div class="summary">
      <For each={(['critical', 'serious', 'moderate', 'minor'] satisfies Impact[])}>
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
