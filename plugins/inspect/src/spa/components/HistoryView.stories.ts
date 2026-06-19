import type { Meta, StoryObj } from '@storybook/vue3'
import HistoryView from './HistoryView.vue'

const meta = {
  title: 'Inspector/HistoryView',
  component: HistoryView,
  tags: ['autodocs'],
  argTypes: {
    'onUpdate:isRecording': { action: 'update:isRecording' },
    'onClear': { action: 'clear' },
  },
} satisfies Meta<typeof HistoryView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    historyRecords: [
      {
        id: 1,
        type: 'call',
        method: 'devframes-plugin-inspect:list-functions',
        args: [],
        result: [{ name: 'dummy' }],
        duration: 42,
        time: Date.now() - 10000,
      },
      {
        id: 2,
        type: 'state',
        key: 'devframe:docks',
        value: [{ id: 'dock1' }],
        syncId: 'xyz123',
        time: Date.now() - 5000,
      },
      {
        id: 3,
        type: 'call',
        method: 'devframes-plugin-inspect:invoke',
        args: ['devframes-plugin-inspect:list-state-keys', []],
        error: { name: 'Error', message: 'Failed' },
        duration: 12,
        time: Date.now() - 1000,
      },
    ],
    isRecording: true,
  },
}

export const Empty: Story = {
  args: {
    historyRecords: [],
    isRecording: true,
  },
}

export const Paused: Story = {
  args: {
    ...Default.args,
    isRecording: false,
  },
}
