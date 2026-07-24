import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { Header } from './Header.tsx'

// The top nav bar: brand, connection status dot, generate-prompts, and rescan.
const meta = {
  title: 'A11y/Header',
  component: Header,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Header>

export default meta
type Story = StoryObj<typeof meta>

function noop() {}
const base = { selectedCount: 0, onGenerate: noop, onRescan: noop }

export const Connected: Story = { args: { ...base, agentReady: true, scanning: false } }
export const Scanning: Story = { args: { ...base, agentReady: true, scanning: true } }
export const WithSelection: Story = { args: { ...base, agentReady: true, scanning: false, selectedCount: 3 } }
export const Disconnected: Story = { args: { ...base, agentReady: false, scanning: false } }
