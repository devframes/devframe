import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import { sampleSources } from './_fixtures'
import DataSourceSelect from './DataSourceSelect.vue'

const meta = {
  title: 'DataInspector/DataSourceSelect',
  component: DataSourceSelect,
  tags: ['autodocs'],
} satisfies Meta<typeof DataSourceSelect>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => ({
    components: { DataSourceSelect },
    setup() {
      const model = ref('devframe')
      return { model, sources: sampleSources }
    },
    template: `<div class="p-4"><DataSourceSelect v-model="model" :sources="sources" /></div>`,
  }),
}

export const Placeholder: Story = {
  render: () => ({
    components: { DataSourceSelect },
    setup() {
      const model = ref<string>()
      return { model, sources: sampleSources }
    },
    template: `<div class="p-4"><DataSourceSelect v-model="model" :sources="sources" placeholder="Pick a data source" /></div>`,
  }),
}
