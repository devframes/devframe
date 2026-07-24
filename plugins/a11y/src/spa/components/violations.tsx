import type { ScanReport, Violation } from '../../shared/protocol.ts'
import type { A11yChannel } from '../lib/channel.ts'
import { For, Show } from 'solid-js'
import { IMPACT_COLOR, IMPACT_LABEL } from '../lib/impact.ts'
import { Chevron } from './icons.tsx'

/** Controller the list uses to read/mutate the violation selection. */
export interface SelectionApi {
  isSelected: (route: string, ruleId: string) => boolean
  toggle: (route: string, ruleId: string) => void
  /** 1-based badge number for a highlighted node, or `null`. */
  numberOf: (nodeId: string) => number | null
}

/** Stable DOM id for a rule card, used by deep-link scroll-into-view. */
export function ruleCardId(route: string, ruleId: string): string {
  return `rule-${encodeURIComponent(route)}-${ruleId}`
}

interface RowProps {
  route: string
  violation: Violation
  expanded: boolean
  selected: boolean
  onToggle: () => void
  onToggleSelect: () => void
  channel: A11yChannel
  numberOf: (nodeId: string) => number | null
}

function ViolationRow(props: RowProps) {
  const v = () => props.violation
  const panelId = () => `nodes-${ruleCardId(props.route, v().ruleId)}`
  const first = () => v().nodes[0]

  return (
    <li
      id={ruleCardId(props.route, v().ruleId)}
      class="rule"
      classList={{ 'rule--selected': props.selected }}
      style={{ '--impact': IMPACT_COLOR[v().impact] }}
      onMouseLeave={() => props.channel.clearPreview()}
    >
      <div class="rule__lead">
        <input
          type="checkbox"
          class="rule__check"
          checked={props.selected}
          aria-label={`Select ${v().ruleId} to highlight and add to fix prompts`}
          onChange={() => props.onToggleSelect()}
          onMouseEnter={() => first() && props.channel.preview(first())}
        />
        <button
          type="button"
          class="rule__toggle"
          aria-expanded={props.expanded}
          aria-controls={panelId()}
          onClick={() => props.onToggle()}
          onMouseEnter={() => first() && props.channel.preview(first())}
          onFocus={() => first() && props.channel.preview(first())}
          onBlur={() => props.channel.clearPreview()}
        >
          <span class="rule__head">
            <span class="rule__impact">{IMPACT_LABEL[v().impact]}</span>
            <Show when={v().bestPractice}>
              <span class="rule__bp" title="axe best-practice rule (not a WCAG success criterion)">best practice</span>
            </Show>
            <code class="rule__id">{v().ruleId}</code>
            <span class="rule__count">
              {v().nodes.length}
              {' '}
              {v().nodes.length === 1 ? 'element' : 'elements'}
              <Chevron class={`rule__chevron${props.expanded ? ' rule__chevron--open' : ''}`} />
            </span>
          </span>
          <span class="rule__help">{v().help}</span>
        </button>
      </div>

      <Show when={props.expanded}>
        <ul class="nodes" id={panelId()}>
          <For each={v().nodes}>
            {node => (
              <li class="node">
                <button
                  type="button"
                  class="node__btn"
                  onMouseEnter={() => props.channel.preview(node)}
                  onFocus={() => props.channel.preview(node)}
                  onMouseLeave={() => props.channel.clearPreview()}
                  onBlur={() => props.channel.clearPreview()}
                >
                  <span class="node__row">
                    <Show when={props.numberOf(node.id)}>
                      {n => <span class="node__badge">{n()}</span>}
                    </Show>
                    <code class="node__html">{node.html}</code>
                  </span>
                  <Show when={node.target.length}>
                    <span class="node__target">{node.target.join(' ')}</span>
                  </Show>
                  <Show when={node.failureSummary}>
                    <span class="node__summary">{node.failureSummary}</span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
        <a class="rule__docslink" href={v().helpUrl} target="_blank" rel="noreferrer noopener">
          Learn how to fix
          {' '}
          {v().ruleId}
          {' ↗'}
        </a>
      </Show>
    </li>
  )
}

interface GroupProps {
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

function RouteGroup(props: GroupProps) {
  return (
    <section id={`group-${encodeURIComponent(props.report.route)}`} class="group" classList={{ 'group--active': props.active }}>
      <div class="group__bar">
        <button
          type="button"
          class="group__toggle"
          aria-expanded={!props.collapsed}
          onClick={() => props.onToggleGroup()}
        >
          <Chevron class={`group__chevron${props.collapsed ? '' : ' group__chevron--open'}`} />
          <code class="group__route">{props.report.route}</code>
          <Show when={props.active}>
            <span class="group__active">active</span>
          </Show>
          <span class="group__count">
            {props.violations.length}
            {' '}
            {props.violations.length === 1 ? 'rule' : 'rules'}
          </span>
        </button>
        <button
          type="button"
          class="group__clear"
          title="Clear this route's history"
          onClick={() => props.onClearRoute()}
        >
          <span aria-hidden class="i-ph-trash-duotone shrink-0" />
        </button>
      </div>
      <Show when={!props.collapsed}>
        <ul class="list">
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

export interface RouteGroupModel {
  report: ScanReport
  active: boolean
  violations: Violation[]
}

interface ListProps {
  groups: RouteGroupModel[]
  collapsedRoutes: Set<string>
  onToggleGroup: (route: string) => void
  onClearRoute: (route: string) => void
  expandedRules: Set<string>
  onToggleRule: (route: string, ruleId: string) => void
  channel: A11yChannel
  selection: SelectionApi
}

export function ViolationList(props: ListProps) {
  return (
    <div class="groups">
      <For each={props.groups}>
        {group => (
          <RouteGroup
            report={group.report}
            active={group.active}
            violations={group.violations}
            collapsed={props.collapsedRoutes.has(group.report.route)}
            onToggleGroup={() => props.onToggleGroup(group.report.route)}
            onClearRoute={() => props.onClearRoute(group.report.route)}
            expandedRules={props.expandedRules}
            onToggleRule={ruleId => props.onToggleRule(group.report.route, ruleId)}
            channel={props.channel}
            selection={props.selection}
          />
        )}
      </For>
    </div>
  )
}
