import type { A11yChannel } from '../lib/channel.ts'
import type { RouteGroupModel, SelectionApi } from '../lib/violation-view.ts'
import { For } from 'solid-js'
import { RouteGroup } from './RouteGroup.tsx'

interface ViolationListProps {
  groups: RouteGroupModel[]
  collapsedRoutes: Set<string>
  onToggleGroup: (route: string) => void
  onClearRoute: (route: string) => void
  expandedRules: Set<string>
  onToggleRule: (route: string, ruleId: string) => void
  channel: A11yChannel
  selection: SelectionApi
}

/** The full, per-route-grouped violation list. */
export function ViolationList(props: ViolationListProps) {
  return (
    <div class="flex flex-col gap-2.5">
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
