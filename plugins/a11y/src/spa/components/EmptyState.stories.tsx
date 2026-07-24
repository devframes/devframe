import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { EmptyState } from './EmptyState.tsx'

// The centered full-height message shown when there's nothing to list.
const meta = {
  title: 'A11y/EmptyState',
  component: EmptyState,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const NoPage: Story = {
  args: {
    icon: 'i-ph-plugs-duotone text-4xl',
    title: 'No page connected',
    body: 'Load the inspector agent in the app you want to check, then this panel will list its accessibility issues live.',
    code: '<script type="module" src="…/inject.js"></script>',
  },
}

export const Scanning: Story = {
  args: {
    icon: 'i-ph-plugs-duotone text-4xl',
    title: 'Scanning the page…',
    body: 'Running axe-core against the connected document.',
  },
}

export const Clean: Story = {
  args: {
    clean: true,
    icon: 'i-ph-check-circle-duotone text-4xl',
    title: 'No violations',
    body: 'axe-core found nothing to flag across the tracked routes.',
  },
}
