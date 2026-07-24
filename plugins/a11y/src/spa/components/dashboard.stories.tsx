import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Dashboard } from './dashboard.tsx'
import '../styles.css'

// The dashboard landing view: totals, the severity summary/filter, scan +
// best-practice controls, and the per-route inventory. Presentational — every
// input is a prop, so it stories offline without a live scan.
const meta = {
  title: 'A11y/Dashboard',
  component: Dashboard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Dashboard>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}

const base = {
  counts: { critical: 3, serious: 5, moderate: 2, minor: 8 },
  filter: null,
  onToggleFilter: noop,
  totalNodes: 18,
  totalRules: 7,
  routes: [
    { route: '/', active: true, ruleCount: 4, nodeCount: 11 },
    { route: '/about', active: false, ruleCount: 3, nodeCount: 7 },
    { route: '/contact', active: false, ruleCount: 0, nodeCount: 0 },
  ],
  onSelectRoute: noop,
  autoScan: true,
  onToggleAutoScan: noop,
  showBestPractice: true,
  onToggleBestPractice: noop,
  onClearAll: noop,
}

/** A spread of violations across several tracked routes. */
export const Overview: Story = { args: base }

/** One severity selected as the active filter. */
export const Filtered: Story = { args: { ...base, filter: 'serious' } }

/** Nothing scanned yet — the empty route inventory. */
export const Empty: Story = {
  args: {
    ...base,
    counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    totalNodes: 0,
    totalRules: 0,
    routes: [],
  },
}
