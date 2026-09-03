import type { Meta, StoryObj } from '@storybook/vue3-vite'
import FilterToggles from './FilterToggles.vue'
import { levels } from './message-styles'

const meta = {
  title: 'Messages/FilterToggles',
  component: FilterToggles,
  tags: ['autodocs'],
  argTypes: {
    onToggle: { action: 'toggled' },
  },
} satisfies Meta<typeof FilterToggles>

export default meta
type Story = StoryObj<typeof meta>

export const Levels: Story = {
  args: {
    label: 'Level',
    items: Object.keys(levels),
    active: new Set<string>(),
    styles: levels,
  },
}

export const LevelsFiltered: Story = {
  args: {
    label: 'Level',
    items: Object.keys(levels),
    active: new Set<string>(['error', 'warn']),
    styles: levels,
  },
}

export const CategoryTags: Story = {
  args: {
    label: 'Category',
    items: ['a11y', 'lint', 'runtime', 'build'],
    active: new Set<string>(),
    tag: 'category',
  },
}

export const LabelTags: Story = {
  args: {
    label: 'Labels',
    items: ['axe', 'eslint', 'vite', 'hmr'],
    active: new Set<string>(),
    tag: 'label',
  },
}
