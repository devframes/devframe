import type { ScanReport, Violation } from '../../shared/protocol.ts'

/** Controller the violation list uses to read/mutate the selection. */
export interface SelectionApi {
  isSelected: (route: string, ruleId: string) => boolean
  toggle: (route: string, ruleId: string) => void
  /** 1-based badge number for a highlighted node, or `null`. */
  numberOf: (nodeId: string) => number | null
}

/** One route's filtered violations, as rendered by a {@link RouteGroup}. */
export interface RouteGroupModel {
  report: ScanReport
  active: boolean
  violations: Violation[]
}

/** Stable DOM id for a rule card, used by deep-link scroll-into-view. */
export function ruleCardId(route: string, ruleId: string): string {
  return `rule-${encodeURIComponent(route)}-${ruleId}`
}
