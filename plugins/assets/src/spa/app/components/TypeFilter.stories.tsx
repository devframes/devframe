import type { Meta, StoryObj } from '@storybook/preact-vite'
import { TypeFilter } from './TypeFilter'

const meta: Meta<typeof TypeFilter> = {
  title: 'Assets/TypeFilter',
  component: TypeFilter,
}
export default meta

type Story = StoryObj<typeof TypeFilter>

export const Default: Story = {
  args: {
    items: [
      { type: 'image', count: 12, checked: true },
      { type: 'video', count: 2, checked: true },
      { type: 'font', count: 3, checked: true },
      { type: 'text', count: 8, checked: true },
      { type: 'other', count: 1, checked: true },
    ],
    onToggle: () => {},
  },
}

export const SomeDeselected: Story = {
  args: {
    items: [
      { type: 'image', count: 12, checked: true },
      { type: 'video', count: 2, checked: false },
      { type: 'font', count: 3, checked: false },
      { type: 'text', count: 8, checked: true },
      { type: 'other', count: 1, checked: true },
    ],
    onToggle: () => {},
  },
}
