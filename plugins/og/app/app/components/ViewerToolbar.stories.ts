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
    template: `<ViewerToolbar v-model:target="target" :loading="false" :is-static="false" :is-embedded="false" />`,
  }),
}

export const Embedded: Story = {
  render: () => ({
    components: { ViewerToolbar },
    setup() {
      const target = ref('/guide/')
      return { target }
    },
    template: `<ViewerToolbar v-model:target="target" :loading="false" :is-static="false" :is-embedded="true" url="http://localhost:5175/guide/" :status="200" />`,
  }),
}

export const Loading: Story = {
  render: () => ({
    components: { ViewerToolbar },
    setup() {
      const target = ref('https://devfra.me/')
      return { target }
    },
    template: `<ViewerToolbar v-model:target="target" :loading="true" :is-static="false" :is-embedded="false" />`,
  }),
}

export const Static: Story = {
  render: () => ({
    components: { ViewerToolbar },
    setup() {
      const target = ref('https://devfra.me/')
      return { target }
    },
    template: `<ViewerToolbar v-model:target="target" :loading="false" :is-static="true" :is-embedded="false" url="https://devfra.me/" :status="200" />`,
  }),
}
