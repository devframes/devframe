import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Switch } from './Switch.tsx'

// The small labelled toggle used for the scan / best-practice controls.
const meta = {
  title: 'A11y/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Switch>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}

export const On: Story = { args: { label: 'Auto-scan', checked: true, onChange: noop } }
export const Off: Story = { args: { label: 'Best-practice', checked: false, onChange: noop } }
