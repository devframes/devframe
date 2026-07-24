import type { Impact } from '../../shared/protocol.ts'
import { For, Show } from 'solid-js'
import { button, nav, navBrand } from '../design'
import { IMPACT_COLOR, IMPACT_LABEL } from '../lib/impact.ts'

interface HeaderProps {
  agentReady: boolean
  scanning: boolean
  selectedCount: number
  onGenerate: () => void
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
        <span aria-hidden class="i-ph-person-simple-circle-duotone text-base color-active" />
        <span>A11y Inspector</span>
      </span>
      <span class="flex-1" />
      <span class="status">
        <span class={dotClass()} />
        {statusLabel()}
      </span>
      <button
        type="button"
        class={button({ variant: 'secondary', size: 'sm' })}
        onClick={() => props.onGenerate()}
        disabled={props.selectedCount === 0}
        title="Generate AI fix prompts for the selected violations"
      >
        <span aria-hidden class="i-ph-sparkle-duotone shrink-0" />
        Generate fix prompts
        <Show when={props.selectedCount > 0}>
          <span class="nav-count">{props.selectedCount}</span>
        </Show>
      </button>
      <button
        type="button"
        class={button({ variant: 'primary', size: 'sm' })}
        onClick={() => props.onRescan()}
        disabled={!props.agentReady || props.scanning}
      >
        <span aria-hidden class="i-ph-arrows-clockwise shrink-0" classList={{ 'animate-spin': props.scanning }} />
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
  /** Hover/focus a chip to preview every element of that impact in the page. */
  onHover?: (impact: Impact | null) => void
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
              aria-label={`${count()} ${IMPACT_LABEL[impact]} issues — filter and highlight`}
              onClick={() => props.onToggle(impact)}
              onMouseEnter={() => props.onHover?.(impact)}
              onMouseLeave={() => props.onHover?.(null)}
              onFocus={() => props.onHover?.(impact)}
              onBlur={() => props.onHover?.(null)}
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
