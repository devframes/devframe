import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import type { SelectedItem } from './FixPromptsDialog.tsx'
import { makeViolation } from './_fixtures.ts'
import { FixPromptsDialog } from './FixPromptsDialog.tsx'

// The fix-prompts dialog: gathers the selected violations' context into one
// paste-ready AI prompt, with a copy button.
const meta = {
  title: 'A11y/FixPromptsDialog',
  component: FixPromptsDialog,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FixPromptsDialog>

export default meta
type Story = StoryObj<typeof meta>

const items: SelectedItem[] = [
  { route: '/', url: 'https://example.test/', violation: makeViolation('image-alt', 'critical', 1) },
  { route: '/forms', url: 'https://example.test/forms', violation: makeViolation('label', 'serious', 1) },
]

export const TwoViolations: Story = { args: { items, onClose: () => {} } }
