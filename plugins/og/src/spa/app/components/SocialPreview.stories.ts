import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { fullSnapshot, sparseSnapshot } from './_fixtures'
import SocialPreview from './SocialPreview.vue'

const meta = {
  title: 'OpenGraph/SocialPreview',
  component: SocialPreview,
  tags: ['autodocs'],
} satisfies Meta<typeof SocialPreview>

export default meta
type Story = StoryObj<typeof meta>

export const RichCard: Story = {
  args: { snapshot: fullSnapshot },
}

export const Sparse: Story = {
  args: { snapshot: sparseSnapshot },
}
