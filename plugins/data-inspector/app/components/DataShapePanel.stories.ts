import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { sampleSkeleton, sampleSources } from './_fixtures'
import DataShapePanel from './DataShapePanel.vue'

const meta = {
  title: 'DataInspector/DataShapePanel',
  component: DataShapePanel,
  tags: ['autodocs'],
} satisfies Meta<typeof DataShapePanel>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  args: {
    source: sampleSources[0],
    skeleton: sampleSkeleton,
    error: null,
    loading: false,
  },
}

export const Loading: Story = {
  args: {
    source: sampleSources[0],
    skeleton: null,
    error: null,
    loading: true,
  },
}

export const Errored: Story = {
  args: {
    source: sampleSources[0],
    skeleton: null,
    error: 'Failed to resolve the data source skeleton.',
    loading: false,
  },
}
