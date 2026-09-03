import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { sampleGroups, stubChannel, stubSelection } from './_fixtures.ts'
import { ViolationList } from './ViolationList.tsx'

// The full, per-route-grouped violation list.
const meta = {
  title: 'A11y/ViolationList',
  component: ViolationList,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ViolationList>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}

export const Grouped: Story = {
  args: {
    groups: sampleGroups,
    collapsedRoutes: new Set(['/about']),
    onToggleGroup: noop,
    onClearRoute: noop,
    expandedRules: new Set(['/::image-alt']),
    onToggleRule: noop,
    channel: stubChannel,
    selection: stubSelection,
  },
}
