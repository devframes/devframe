import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { MetaLine } from './MetaLine.tsx'

// The mono meta strip under the nav: scanned URL, backend tag, axe version.
const meta = {
  title: 'A11y/MetaLine',
  component: MetaLine,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof MetaLine>

export default meta
type Story = StoryObj<typeof meta>

const base = {
  url: 'https://example.test/checkout',
  engine: '4.10.0',
  backend: () => 'websocket',
  status: () => 'connected',
}

/** Live dev server (WebSocket backend). */
export const Dev: Story = { args: base }

/** Baked static build. */
export const Static: Story = { args: { ...base, backend: () => 'static' } }

/** Degraded backend connection — surfaced as a quiet amber tag. */
export const Degraded: Story = { args: { ...base, status: () => 'disconnected' } }
