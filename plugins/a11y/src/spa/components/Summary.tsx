import type { Impact } from '../../shared/protocol.ts'
import { For } from 'solid-js'
import { IMPACT_COLOR, IMPACT_LABEL } from '../lib/impact.ts'

interface SummaryProps {
  counts: Record<Impact, number>
  active: Impact | null
  onToggle: (impact: Impact) => void
  /** Hover/focus a chip to preview every element of that impact in the page. */
  onHover?: (impact: Impact | null) => void
}

const IMPACTS: Impact[] = ['critical', 'serious', 'moderate', 'minor']

/**
 * The severity summary chips — also the impact filter. The one expressive,
 * domain-specific color (WCAG severity) rides an inline `--impact` CSS var so
 * the utility classes can reference it.
 */
export function Summary(props: SummaryProps) {
  return (
    <div class="grid grid-cols-4 gap-1.5">
      <For each={IMPACTS}>
        {(impact) => {
          const count = () => props.counts[impact]
          const pressed = () => props.active === impact
          return (
            <button
              type="button"
              class="flex items-baseline gap-1.5 px-3 py-2 text-left bg-secondary border border-base border-l-3 border-l-[color:var(--impact)] cursor-pointer transition hover:bg-active outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              classList={{
                'bg-[color-mix(in_srgb,var(--impact)_16%,transparent)]! border-[color:var(--impact)]!': pressed(),
                'color-[var(--impact)]': count() > 0,
                'color-muted': count() === 0,
              }}
              style={{ '--impact': IMPACT_COLOR[impact] }}
              aria-pressed={pressed()}
              aria-label={`${count()} ${IMPACT_LABEL[impact]} issues — filter and highlight`}
              onClick={() => props.onToggle(impact)}
              onMouseEnter={() => props.onHover?.(impact)}
              onMouseLeave={() => props.onHover?.(null)}
              onFocus={() => props.onHover?.(impact)}
              onBlur={() => props.onHover?.(null)}
            >
              <span class="text-lg font-bold tabular-nums leading-none">
                {count()}
              </span>
              <span class="text-xs font-semibold tracking-wide uppercase">
                {IMPACT_LABEL[impact]}
              </span>
            </button>
          )
        }}
      </For>
    </div>
  )
}
