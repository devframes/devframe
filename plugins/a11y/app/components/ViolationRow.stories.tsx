import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { makeViolation, stubChannel, stubSelection } from './_fixtures.ts'
import { ViolationRow } from './ViolationRow.tsx'

// One violation card: severity-spined, with a select checkbox and (expanded)
// the offending elements. Wrapped in a `<ul>` so the list-item renders.
const meta = {
  title: 'A11y/ViolationRow',
  component: ViolationRow,
  parameters: { layout: 'padded' },
  decorators: [(Story: () => any) => <ul class="list-none m-0 p-0">{Story()}</ul>],
} satisfies Meta<typeof ViolationRow>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}
const base = {
  route: '/',
  onToggle: noop,
  onToggleSelect: noop,
  channel: stubChannel,
  numberOf: stubSelection.numberOf,
}

export const Collapsed: Story = {
  args: { ...base, violation: makeViolation('color-contrast', 'serious', 3), expanded: false, selected: false },
}

export const Expanded: Story = {
  args: { ...base, violation: makeViolation('image-alt', 'critical', 2), expanded: true, selected: false },
}

export const Selected: Story = {
  args: { ...base, violation: makeViolation('image-alt', 'critical', 2), expanded: true, selected: true },
}

export const BestPractice: Story = {
  args: { ...base, violation: makeViolation('region', 'moderate', 1, true), expanded: false, selected: false },
}
