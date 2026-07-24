import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { SummaryBar } from './SummaryBar.tsx'

// The single-page summary band: severity chips (impact filter), a one-line
// count, and the scan / best-practice / clear controls.
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
  onHoverImpact: noop,
  totalNodes: 18,
  totalRules: 7,
  routeCount: 3,
  selectedCount: 0,
  allSelected: false,
  onSelectAll: noop,
  onInvertSelection: noop,
  onClearSelection: noop,
  autoScan: true,
  onToggleAutoScan: noop,
  showBestPractice: true,
  onToggleBestPractice: noop,
  onClearAll: noop,
}

export const Overview: Story = { args: base }
export const Filtered: Story = { args: { ...base, filter: 'serious' } }
export const WithSelection: Story = { args: { ...base, selectedCount: 4 } }
export const AllSelected: Story = { args: { ...base, selectedCount: 7, allSelected: true } }
