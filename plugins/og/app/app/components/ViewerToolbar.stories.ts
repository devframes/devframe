import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import ViewerToolbar from './ViewerToolbar.vue'

const meta = {
  title: 'OpenGraph/ViewerToolbar',
  component: ViewerToolbar,
  tags: ['autodocs'],
} satisfies Meta<typeof ViewerToolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  render: () => ({
    components: { ViewerToolbar },
    setup() {
      const target = ref('https://devfra.me/')
      return { target }
    },
    template: `<ViewerToolbar v-model:target="target" :loading="false" :is-static="false" />`,
  }),
}

export const Loading: Story = {
  render: () => ({
    components: { ViewerToolbar },
    setup() {
      const target = ref('https://devfra.me/')
      return { target }
    },
    template: `<ViewerToolbar v-model:target="target" :loading="true" :is-static="false" />`,
  }),
}

export const Static: Story = {
  render: () => ({
    components: { ViewerToolbar },
    setup() {
      const target = ref('https://devfra.me/')
      return { target }
    },
    template: `<ViewerToolbar v-model:target="target" :loading="false" :is-static="true" />`,
  }),
}
