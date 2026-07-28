import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import { sampleFilters } from './_fixtures'
import QuerySettings from './QuerySettings.vue'

const meta = {
  title: 'DataInspector/QuerySettings',
  component: QuerySettings,
  tags: ['autodocs'],
} satisfies Meta<typeof QuerySettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => ({
    components: { QuerySettings },
    setup() {
      const settings = ref({ ...sampleFilters })
      const autoRun = ref(false)
      const autoRunSeconds = ref(5)
      return { settings, autoRun, autoRunSeconds }
    },
    template: `<div class="p-4 max-w-2xl"><QuerySettings v-model="settings" v-model:auto-run="autoRun" v-model:auto-run-seconds="autoRunSeconds" /></div>`,
  }),
}

export const AutoRunEnabled: Story = {
  render: () => ({
    components: { QuerySettings },
    setup() {
      const settings = ref({ excludeFunctions: true, excludeUnderscoreProps: true, excludeDollarProps: false })
      const autoRun = ref(true)
      const autoRunSeconds = ref(10)
      return { settings, autoRun, autoRunSeconds }
    },
    template: `<div class="p-4 max-w-2xl"><QuerySettings v-model="settings" v-model:auto-run="autoRun" v-model:auto-run-seconds="autoRunSeconds" /></div>`,
  }),
}
