import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import type { ScanReport, Violation } from '../../shared/protocol.ts'
import type { A11yChannel } from '../lib/channel.ts'
import type { PinsApi, RouteGroupModel } from './violations.tsx'
import { emptyCounts } from '../../shared/protocol.ts'
import { ViolationList } from './violations.tsx'
import '../styles.css'

// The grouped, per-route violation list with its pin controls. Driven by plain
// data + no-op controllers so it stories without a live agent.
const meta = {
  title: 'A11y/ViolationList',
  component: ViolationList,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ViolationList>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}

const channel = {
  preview: noop,
  clearPreview: noop,
  clearRoute: noop,
} as unknown as A11yChannel

const pins: PinsApi = {
  isPinned: () => false,
  numberOf: () => null,
  isRulePinned: () => false,
  toggleNode: noop,
  toggleRule: noop,
}

function violation(ruleId: string, impact: Violation['impact'], nodes = 1, bestPractice = false): Violation {
  return {
    ruleId,
    impact,
    help: `Ensure ${ruleId} is correct`,
    description: `Ensures ${ruleId}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/${ruleId}`,
    tags: ['wcag2a'],
    bestPractice,
    nodes: Array.from({ length: nodes }, (_, i) => ({
      id: `${ruleId}-${i}`,
      target: [`#${ruleId}-${i}`],
      html: `<div id="${ruleId}-${i}">…</div>`,
      failureSummary: `Fix the ${ruleId} element`,
    })),
  }
}

function report(route: string, violations: Violation[]): ScanReport {
  return { route, url: `https://example.test${route}`, scannedAt: 1, engine: '4.10.0', violations, counts: emptyCounts() }
}

const groups: RouteGroupModel[] = [
  {
    report: report('/', [violation('image-alt', 'critical', 2), violation('color-contrast', 'serious', 3)]),
    active: true,
    violations: [violation('image-alt', 'critical', 2), violation('color-contrast', 'serious', 3)],
  },
  {
    report: report('/about', [violation('region', 'moderate', 1, true)]),
    active: false,
    violations: [violation('region', 'moderate', 1, true)],
  },
]

/** Two tracked routes, the active one expanded. */
export const Grouped: Story = {
  args: {
    groups,
    collapsedRoutes: new Set(['/about']),
    onToggleGroup: noop,
    onClearRoute: noop,
    expandedRules: new Set(['/::image-alt']),
    onToggleRule: noop,
    channel,
    pins,
  },
}
