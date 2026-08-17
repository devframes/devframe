import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { h } from 'vue'
import ViewIframeLoading from './ViewIframeLoading.vue'

// The placeholder fills its positioned parent (`absolute inset-0`), so the
// stage mirrors the iframe view frame it renders into at runtime.
function stage(children: any) {
  return h('div', { class: 'relative h-100 bg-base color-base border border-base rounded-lg overflow-hidden font-sans' }, children)
}

const meta = {
  title: 'Views/IframeLoading',
  component: ViewIframeLoading,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Shown over an iframe view while it loads its content. A blank iframe paints white during load, so `ViewIframe` reveals this placeholder by hiding the pane — the same layering trick as the assets-error panel. It covers the initial load and any hard navigation or refresh.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj

export const Loading: Story = {
  render: () => ({
    setup: () => () => stage(h(ViewIframeLoading)),
  }),
}
