import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Summary } from './header.tsx'

// The severity summary chips — the one expressive, domain-specific color in the
// inspector. Presentational: driven entirely by the per-impact counts, so it
// stories offline without a live scan.
const meta = {
  title: 'A11y/Summary',
  component: Summary,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Summary>

export default meta
type Story = StoryObj<typeof meta>

const counts = { critical: 3, serious: 5, moderate: 2, minor: 8 }

/** A spread of violations across every severity bucket. */
export const Issues: Story = {
  args: { counts, active: null, onToggle: () => {} },
}

/** One severity selected as the active filter. */
export const Filtered: Story = {
  args: { counts, active: 'serious', onToggle: () => {} },
}

/** A clean report — every bucket at zero. */
export const Clean: Story = {
  args: {
    counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    active: null,
    onToggle: () => {},
  },
}
