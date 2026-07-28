import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { fullTags, sparseTags } from './_fixtures'
import MetadataTable from './MetadataTable.vue'

const meta = {
  title: 'OpenGraph/MetadataTable',
  component: MetadataTable,
  tags: ['autodocs'],
} satisfies Meta<typeof MetadataTable>

export default meta
type Story = StoryObj<typeof meta>

export const Full: Story = {
  args: { tags: fullTags },
}

export const Sparse: Story = {
  args: { tags: sparseTags },
}

export const Empty: Story = {
  args: { tags: [] },
}
