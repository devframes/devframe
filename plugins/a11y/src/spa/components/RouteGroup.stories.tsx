import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { makeReport, makeViolation, stubChannel, stubSelection } from './_fixtures.ts'
import { RouteGroup } from './RouteGroup.tsx'

// A collapsible group of one route's violations, headed by its path + counts.
const meta = {
  title: 'A11y/RouteGroup',
  component: RouteGroup,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RouteGroup>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}
const violations = [makeViolation('image-alt', 'critical', 2), makeViolation('label', 'serious', 1)]
const base = {
  report: makeReport('/forms', violations),
  violations,
  onToggleGroup: noop,
  onClearRoute: noop,
  expandedRules: new Set(['/forms::image-alt']),
  onToggleRule: noop,
  channel: stubChannel,
  selection: stubSelection,
}

export const ActiveExpanded: Story = { args: { ...base, active: true, collapsed: false } }
export const Collapsed: Story = { args: { ...base, active: false, collapsed: true } }
