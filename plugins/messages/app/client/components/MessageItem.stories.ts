import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { makeSampleEntries } from './_fixtures'
import MessageItem from './MessageItem.vue'

const entries = makeSampleEntries()

const meta = {
  title: 'Messages/MessageItem',
  component: MessageItem,
  tags: ['autodocs'],
} satisfies Meta<typeof MessageItem>

export default meta
type Story = StoryObj<typeof meta>

export const Info: Story = {
  args: { entry: entries.find(e => e.id === 'sample:info')! },
}

export const ErrorWithNotify: Story = {
  args: { entry: entries.find(e => e.id === 'sample:error')! },
}

export const Loading: Story = {
  args: { entry: entries.find(e => e.id === 'sample:loading')! },
}

export const Compact: Story = {
  args: { entry: entries.find(e => e.id === 'sample:a11y')!, compact: true },
}
