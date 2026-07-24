import type { ScanReport, Violation } from '../../shared/protocol.ts'
import type { A11yChannel } from '../lib/channel.ts'
import type { SelectionApi } from '../lib/violation-view.ts'
import { For, Show } from 'solid-js'
import { ViolationRow } from './ViolationRow.tsx'

interface RouteGroupProps {
  report: ScanReport
  active: boolean
  violations: Violation[]
  collapsed: boolean
  onToggleGroup: () => void
  onClearRoute: () => void
  expandedRules: Set<string>
  onToggleRule: (ruleId: string) => void
  channel: A11yChannel
  selection: SelectionApi
}

/** A collapsible group of one route's violations, headed by its path + counts. */
export function RouteGroup(props: RouteGroupProps) {
  return (
    <section id={`group-${encodeURIComponent(props.report.route)}`} class="flex flex-col">
      <div class="flex items-center gap-1 py-0.5">
        <button
          type="button"
          class="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer py-1 px-0.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          aria-expanded={!props.collapsed}
          onClick={() => props.onToggleGroup()}
        >
          <span aria-hidden class="i-ph-caret-right text-sm color-faint transition-transform shrink-0" classList={{ 'rotate-90': !props.collapsed }} />
          <code class={`font-mono text-[12.5px] truncate ${props.active ? 'color-active' : 'color-base'}`}>{props.report.route}</code>
          <Show when={props.active}>
            <span class="text-[9.5px] font-bold tracking-wide uppercase color-active border border-primary-500/45 rounded-full px-1.5 shrink-0">active</span>
          </Show>
          <span class="ml-auto text-[11px] color-faint tabular-nums shrink-0">
            {props.violations.length}
            {' '}
            {props.violations.length === 1 ? 'rule' : 'rules'}
          </span>
        </button>
        <button
          type="button"
          class="shrink-0 inline-flex p-1 rounded color-faint cursor-pointer transition hover:text-error hover:bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          title="Clear this route's history"
          onClick={() => props.onClearRoute()}
        >
          <span aria-hidden class="i-ph-trash-duotone shrink-0" />
        </button>
      </div>
      <Show when={!props.collapsed}>
        <ul class="list-none m-0 mt-1 flex flex-col gap-1">
          <For each={props.violations}>
            {violation => (
              <ViolationRow
                route={props.report.route}
                violation={violation}
                expanded={props.expandedRules.has(`${props.report.route}::${violation.ruleId}`)}
                selected={props.selection.isSelected(props.report.route, violation.ruleId)}
                onToggle={() => props.onToggleRule(violation.ruleId)}
                onToggleSelect={() => props.selection.toggle(props.report.route, violation.ruleId)}
                channel={props.channel}
                numberOf={props.selection.numberOf}
              />
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}
