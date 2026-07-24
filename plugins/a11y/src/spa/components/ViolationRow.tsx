import type { Violation } from '../../shared/protocol.ts'
import type { A11yChannel } from '../lib/channel.ts'
import { For, Show } from 'solid-js'
import { IMPACT_COLOR, IMPACT_LABEL } from '../lib/impact.ts'
import { ruleCardId } from '../lib/violation-view.ts'

interface ViolationRowProps {
  route: string
  violation: Violation
  expanded: boolean
  selected: boolean
  onToggle: () => void
  onToggleSelect: () => void
  channel: A11yChannel
  numberOf: (nodeId: string) => number | null
}

/**
 * One violation card: a severity-spined row with a select checkbox (drives the
 * in-page highlight + fix-prompt selection) and, when expanded, the offending
 * elements with their markup, selector, and axe failure summary.
 */
export function ViolationRow(props: ViolationRowProps) {
  const v = () => props.violation
  const panelId = () => `nodes-${ruleCardId(props.route, v().ruleId)}`
  const first = () => v().nodes[0]

  return (
    <li
      id={ruleCardId(props.route, v().ruleId)}
      class="relative bg-secondary border border-base border-l-3 border-l-[color:var(--impact)]  overflow-hidden transition hover:shadow-md"
      classList={{ 'bg-[color-mix(in_srgb,var(--impact)_8%,transparent)]! border-[color:var(--impact)]/60': props.selected }}
      style={{ '--impact': IMPACT_COLOR[v().impact] }}
      onMouseLeave={() => props.channel.clearPreview()}
    >
      <div class="flex items-stretch">
        <input
          type="checkbox"
          class="shrink-0 self-center size-[15px] ml-3 accent-[var(--impact)] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          checked={props.selected}
          aria-label={`Select ${v().ruleId} to highlight and add to fix prompts`}
          onChange={() => props.onToggleSelect()}
          onMouseEnter={() => first() && props.channel.preview(first())}
        />
        <button
          type="button"
          class="flex flex-col gap-0.5 flex-1 min-w-0 text-left cursor-pointer outline-none py-[7px] pl-2.5 pr-3"
          aria-expanded={props.expanded}
          aria-controls={panelId()}
          onClick={() => props.onToggle()}
          onMouseEnter={() => first() && props.channel.preview(first())}
          onFocus={() => first() && props.channel.preview(first())}
          onBlur={() => props.channel.clearPreview()}
        >
          <span class="flex items-center gap-1.5">
            <span class="text-[9px] font-bold tracking-wide uppercase color-[var(--impact)]">{IMPACT_LABEL[v().impact]}</span>
            <Show when={v().bestPractice}>
              <span class="text-[9.5px] font-bold tracking-wide uppercase color-muted border border-base rounded-full px-1.5" title="axe best-practice rule (not a WCAG success criterion)">best practice</span>
            </Show>
            <code class="font-mono text-xs color-base">{v().ruleId}</code>
            <span class="ml-auto inline-flex items-center gap-1.5 text-[11px] color-faint tabular-nums">
              {v().nodes.length}
              {' '}
              {v().nodes.length === 1 ? 'element' : 'elements'}
              <span aria-hidden class="i-ph-caret-right text-sm color-faint transition-transform" classList={{ 'rotate-90': props.expanded }} />
            </span>
          </span>
          <span class="text-xs color-muted leading-snug truncate">{v().help}</span>
        </button>
      </div>

      <Show when={props.expanded}>
        <ul class="list-none m-0 flex flex-col gap-1 pl-3.5 pr-2.5 pb-2" id={panelId()}>
          <For each={v().nodes}>
            {node => (
              <li>
                <button
                  type="button"
                  class="block w-full bg-[#8881] text-left border border-base rounded px-2.5 py-1.5 cursor-pointer transition hover:bg-hover outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  onMouseEnter={() => props.channel.preview(node)}
                  onFocus={() => props.channel.preview(node)}
                  onMouseLeave={() => props.channel.clearPreview()}
                  onBlur={() => props.channel.clearPreview()}
                >
                  <span class="flex items-start gap-1.5">
                    <Show when={props.numberOf(node.id)}>
                      {n => <span class="shrink-0 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-primary-500 text-white text-[10.5px] font-bold tabular-nums">{n()}</span>}
                    </Show>
                    <code class="block font-mono text-[11px] color-base whitespace-pre-wrap break-words">{node.html}</code>
                  </span>
                  <Show when={node.target.length}>
                    <span class="inline-block mt-1.5 font-mono text-[10.5px] text-primary-500 bg-primary-500/12 rounded px-1.5 py-px">{node.target.join(' ')}</span>
                  </Show>
                  <Show when={node.failureSummary}>
                    <span class="block mt-1.5 text-[11px] leading-snug color-muted whitespace-pre-wrap">{node.failureSummary}</span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
        <a class="self-start block ml-3.5 mb-2 text-[11px] color-faint no-underline hover:color-active hover:underline" href={v().helpUrl} target="_blank" rel="noreferrer noopener">
          Learn how to fix
          {' '}
          {v().ruleId}
          {' ↗'}
        </a>
      </Show>
    </li>
  )
}
