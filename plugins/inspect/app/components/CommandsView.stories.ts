import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CommandsView from './CommandsView.vue'

const meta = {
  title: 'Inspector/CommandsView',
  component: CommandsView,
  tags: ['autodocs'],
  argTypes: {
    onExecute: { action: 'executed' },
  },
} satisfies Meta<typeof CommandsView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    commands: [
      {
        id: 'demo:say-hello',
        title: 'Say Hello',
        description: 'Returns a greeting for the given name.',
        category: 'demo',
        icon: 'i-ph-hand-waving-duotone',
        hasHandler: true,
      },
      {
        id: 'vite:open-in-editor',
        title: 'Open in Editor',
        description: 'Opens a file at a line/column in the configured editor.',
        category: 'vite',
        hasHandler: true,
      },
      {
        id: 'demo:group',
        title: 'Demo Group',
        category: 'demo',
        hasHandler: false,
        children: [
          {
            id: 'demo:group:child-a',
            title: 'Child A',
            hasHandler: true,
          },
          {
            id: 'demo:group:child-b',
            title: 'Child B',
            hasHandler: true,
          },
        ],
      },
    ],
    isStatic: false,
    results: {},
    pending: {},
  },
}

export const Empty: Story = {
  args: {
    ...Default.args,
    commands: [],
  },
}

export const StaticMode: Story = {
  args: {
    ...Default.args,
    isStatic: true,
  },
}

export const WithResultsAndPending: Story = {
  args: {
    ...Default.args,
    results: {
      'demo:say-hello': {
        ok: true,
        result: 'Hello, Ada!',
        durationMs: 8,
      },
      'demo:group': {
        ok: false,
        error: { name: 'Error', message: 'Command "demo:group" has no handler (group-only command)' },
        durationMs: 1,
      },
    },
    pending: {
      'vite:open-in-editor': true,
    },
  },
}
