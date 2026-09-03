import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import Toolbar from './Toolbar.vue'

const meta = {
  title: 'Assets/Toolbar',
  component: Toolbar,
  tags: ['autodocs'],
} satisfies Meta<typeof Toolbar>

export default meta
type Story = StoryObj<typeof meta>

function harness(props: Record<string, unknown>) {
  return () => ({
    components: { Toolbar },
    setup() {
      const search = ref('')
      const view = ref<'grid' | 'list'>('grid')
      return { search, view, props }
    },
    template: `<Toolbar v-model:search="search" v-model:view="view" v-bind="props" />`,
  })
}

const base = { total: 42, filtered: 42, canWrite: true, isStatic: false, readOnly: false, uploading: false, selectedCount: 0 }

export const Default: Story = { render: harness(base) }
export const ReadOnly: Story = { render: harness({ ...base, canWrite: false, readOnly: true }) }
export const Uploading: Story = { render: harness({ ...base, uploading: true }) }
export const SelectionMode: Story = { render: harness({ ...base, selectedCount: 5 }) }
