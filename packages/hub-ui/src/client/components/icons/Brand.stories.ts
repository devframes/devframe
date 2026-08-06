import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import BrandMark from './BrandMark.vue'
import BrandWordmark from './BrandWordmark.vue'

const meta = {
  title: 'Brand/Logos',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'The Devframes brand marks used across the dock and standalone shells.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

/** The Devframes mark (the minimized dock nub / auth screen logo). */
export const Mark: Story = {
  name: 'BrandMark',
  render: () => ({ setup: () => () => h('div', { class: 'w-24 h-24' }, h(BrandMark)) }),
}

/** The Devframes wordmark (recolors with the theme). */
export const Wordmark: Story = {
  name: 'BrandWordmark',
  render: () => ({ setup: () => () => h(BrandWordmark) }),
}
