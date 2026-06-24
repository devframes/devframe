import type { Violation } from '../../shared/protocol.ts'
import type { A11yChannel } from '../lib/channel.ts'
import { createMemo, For, Show } from 'solid-js'
import { IMPACT_COLOR, IMPACT_LABEL } from '../lib/impact.ts'
import { Chevron } from './icons.tsx'

interface RowProps {
  violation: Violation
  index: number
  expanded: boolean
  onToggle: () => void
  channel: A11yChannel
}

function ViolationRow(props: RowProps) {
  const v = () => props.violation
  const panelId = createMemo(() => `nodes-${props.index}`)
  const first = () => v().nodes[0]

  return (
    <li
      class="rule"
      style={{ '--impact': IMPACT_COLOR[v().impact] }}
      onMouseLeave={() => props.channel.clearHighlight()}
    >
      <button
        type="button"
        class="rule__toggle"
        aria-expanded={props.expanded}
        aria-controls={panelId()}
        onClick={() => props.onToggle()}
        onMouseEnter={() => first() && props.channel.highlight(first())}
        onFocus={() => first() && props.channel.highlight(first())}
        onBlur={() => props.channel.clearHighlight()}
      >
        <span class="rule__head">
          <span class="rule__impact">{IMPACT_LABEL[v().impact]}</span>
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

      <Show when={props.expanded}>
        <ul class="nodes" id={panelId()}>
          <For each={v().nodes}>
            {node => (
              <li class="node">
                <button
                  type="button"
                  class="node__btn"
                  onMouseEnter={() => props.channel.highlight(node)}
                  onFocus={() => props.channel.highlight(node)}
                  onBlur={() => props.channel.clearHighlight()}
                  onClick={() => props.channel.highlight(node)}
                >
                  <code class="node__html">{node.html}</code>
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

interface ListProps {
  violations: Violation[]
  expanded: Set<string>
  onToggle: (ruleId: string) => void
  channel: A11yChannel
}

export function ViolationList(props: ListProps) {
  return (
    <ul class="list">
      <For each={props.violations}>
        {(violation, i) => (
          <ViolationRow
            violation={violation}
            index={i()}
            expanded={props.expanded.has(violation.ruleId)}
            onToggle={() => props.onToggle(violation.ruleId)}
            channel={props.channel}
          />
        )}
      </For>
    </ul>
  )
}
