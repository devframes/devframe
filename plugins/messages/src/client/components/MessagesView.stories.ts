import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { makeSampleEntries } from './_fixtures'
import MessagesView from './MessagesView.vue'

const meta = {
  title: 'Messages/MessagesView',
  component: MessagesView,
  tags: ['autodocs'],
  argTypes: {
    onDismiss: { action: 'dismissed' },
    onDismissMany: { action: 'dismissed many' },
    onClear: { action: 'cleared' },
    onOpenFile: { action: 'opened file' },
    onPersist: { action: 'persisted' },
  },
  decorators: [
    () => ({ template: '<div class="h-120 bg-base color-base"><story /></div>' }),
  ],
} satisfies Meta<typeof MessagesView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    entries: makeSampleEntries(),
    canOpenFile: true,
  },
}

export const Empty: Story = {
  args: {
    entries: [],
  },
}

export const StaticBackend: Story = {
  args: {
    entries: makeSampleEntries(),
    canOpenFile: false,
  },
}
