import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { SummaryBar } from './summary.tsx'
import '../styles.css'

// The single-page summary band: severity chips (impact filter), a one-line
// count, and the scan / best-practice / clear controls. Presentational.
const meta = {
  title: 'A11y/SummaryBar',
  component: SummaryBar,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SummaryBar>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}

const base = {
  counts: { critical: 3, serious: 5, moderate: 2, minor: 8 },
  filter: null,
  onToggleFilter: noop,
  totalNodes: 18,
  totalRules: 7,
  routeCount: 3,
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
