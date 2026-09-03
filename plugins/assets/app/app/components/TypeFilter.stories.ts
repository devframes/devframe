import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TypeFilter from './TypeFilter.vue'

const meta = {
  title: 'Assets/TypeFilter',
  component: TypeFilter,
  tags: ['autodocs'],
  argTypes: { onToggle: { action: 'toggle' } },
} satisfies Meta<typeof TypeFilter>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    items: [
      { type: 'image', count: 12, checked: true },
      { type: 'video', count: 2, checked: true },
      { type: 'font', count: 3, checked: true },
      { type: 'text', count: 8, checked: true },
      { type: 'other', count: 1, checked: true },
    ],
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
  },
}
