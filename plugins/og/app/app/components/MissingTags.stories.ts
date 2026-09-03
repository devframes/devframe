import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { fullTags, sparseTags } from './_fixtures'
import MissingTags from './MissingTags.vue'

const meta = {
  title: 'OpenGraph/MissingTags',
  component: MissingTags,
  tags: ['autodocs'],
} satisfies Meta<typeof MissingTags>

export default meta
type Story = StoryObj<typeof meta>

export const ManyMissing: Story = {
  args: { tags: sparseTags },
}

export const NoneMissing: Story = {
  args: { tags: fullTags },
}
