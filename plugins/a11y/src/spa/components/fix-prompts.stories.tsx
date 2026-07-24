import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import type { SelectedItem } from './fix-prompts.tsx'
import { FixPromptsDialog } from './fix-prompts.tsx'
import '../styles.css'

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
  {
    route: '/',
    url: 'https://example.test/',
    violation: {
      ruleId: 'image-alt',
      impact: 'critical',
      help: 'Images must have alternative text',
      description: 'Ensures <img> elements have alternate text or a role of none or presentation',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
      tags: ['wcag2a', 'wcag111'],
      nodes: [{
        id: 'a1',
        target: ['img.hero'],
        html: '<img class="hero" src="/banner.png">',
        failureSummary: 'Fix any of the following:\n  Element does not have an alt attribute',
      }],
    },
  },
  {
    route: '/forms',
    url: 'https://example.test/forms',
    violation: {
      ruleId: 'label',
      impact: 'serious',
      help: 'Form elements must have labels',
      description: 'Ensures every form element has a label',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
      tags: ['wcag2a', 'wcag412'],
      nodes: [{
        id: 'a2',
        target: ['#email'],
        html: '<input id="email" type="email" placeholder="Email">',
        failureSummary: 'Fix any of the following:\n  Form element does not have an implicit label',
      }],
    },
  },
]

export const TwoViolations: Story = {
  args: { items, onClose: () => {} },
}
