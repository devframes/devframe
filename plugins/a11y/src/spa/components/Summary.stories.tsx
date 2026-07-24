import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Summary } from './Summary.tsx'

// The severity summary chips — the one expressive, domain-specific color in the
// inspector, and the impact filter. Presentational: driven by per-impact counts.
const meta = {
  title: 'A11y/Summary',
  component: Summary,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Summary>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}
const counts = { critical: 3, serious: 5, moderate: 2, minor: 8 }

export const Issues: Story = { args: { counts, active: null, onToggle: noop } }
export const Filtered: Story = { args: { counts, active: 'serious', onToggle: noop } }
export const Clean: Story = {
  args: { counts: { critical: 0, serious: 0, moderate: 0, minor: 0 }, active: null, onToggle: noop },
}
