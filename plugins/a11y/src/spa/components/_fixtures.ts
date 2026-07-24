import type { ScanReport, Violation } from '../../shared/protocol.ts'
import type { A11yChannel } from '../lib/channel.ts'
import type { RouteGroupModel, SelectionApi } from '../lib/violation-view.ts'
import { emptyCounts } from '../../shared/protocol.ts'

function noop() {}

/** A no-op channel stub — enough for the hover/clear calls the rows fire. */
export const stubChannel = { preview: noop, clearPreview: noop, clearRoute: noop } as unknown as A11yChannel

/** A selection stub that marks `image-alt` selected and numbers its nodes. */
export const stubSelection: SelectionApi = {
  isSelected: (_route, ruleId) => ruleId === 'image-alt',
  toggle: noop,
  numberOf: nodeId => (nodeId.startsWith('image-alt') ? Number(nodeId.split('-').pop()) + 1 : null),
}

export function makeViolation(ruleId: string, impact: Violation['impact'], nodes = 1, bestPractice = false): Violation {
  return {
    ruleId,
    impact,
    help: `Ensure ${ruleId} is correct`,
    description: `Ensures ${ruleId}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/${ruleId}`,
    tags: ['wcag2a', 'wcag111'],
    bestPractice,
    nodes: Array.from({ length: nodes }, (_, i) => ({
      id: `${ruleId}-${i}`,
      target: [`#${ruleId}-${i}`],
      html: `<div id="${ruleId}-${i}">…</div>`,
      failureSummary: `Fix any of the following:\n  Fix the ${ruleId} element`,
    })),
  }
}

export function makeReport(route: string, violations: Violation[]): ScanReport {
  return { route, url: `https://example.test${route}`, scannedAt: 1, engine: '4.10.0', violations, counts: emptyCounts() }
}

export const sampleGroups: RouteGroupModel[] = [
  {
    report: makeReport('/', []),
    active: true,
    violations: [makeViolation('image-alt', 'critical', 2), makeViolation('color-contrast', 'serious', 3)],
  },
  {
    report: makeReport('/about', []),
    active: false,
    violations: [makeViolation('region', 'moderate', 1, true)],
  },
]
