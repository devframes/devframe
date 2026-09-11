import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ClientView from './ClientView.vue'

const meta = {
  title: 'Inspector/ClientView',
  component: ClientView,
  tags: ['autodocs'],
  argTypes: {
    onInvoke: { action: 'invoked' },
    onInvokeTool: { action: 'invoked-tool' },
  },
} satisfies Meta<typeof ClientView>

export default meta
type Story = StoryObj<typeof meta>

const functions = [
  {
    name: 'devframe:rpc:client-state:updated',
    type: 'event' as const,
    jsonSerializable: false,
    snapshot: false,
    cacheable: false,
    hasArgs: false,
    hasReturns: false,
    hasDump: false,
    hasSetup: false,
    hasHandler: true,
    invokable: false,
  },
  {
    name: 'my-plugin:get-selection',
    type: 'query' as const,
    jsonSerializable: true,
    snapshot: false,
    cacheable: false,
    hasArgs: false,
    hasReturns: true,
    hasDump: false,
    hasSetup: false,
    hasHandler: true,
    invokable: true,
    agent: {
      description: 'Return the node currently selected in the page.',
      title: 'Get selection',
    },
  },
]

export const LiveModelContext: Story = {
  args: {
    functions,
    webmcp: {
      available: true,
      live: true,
      executable: true,
      tools: [
        {
          name: 'my-plugin_get-selection',
          description: 'Return the node currently selected in the page.',
          inputSchema: { type: 'object', properties: {} },
          origin: 'http://localhost:5173',
        },
        {
          name: 'add-todo',
          description: 'Add a new item to the todo list.',
          inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          origin: 'http://localhost:5173',
        },
      ],
    },
    results: {},
    pending: {},
  },
}

export const ProjectedWithoutModelContext: Story = {
  args: {
    functions,
    webmcp: {
      available: false,
      live: false,
      executable: false,
      tools: [
        {
          name: 'my-plugin_get-selection',
          description: 'Return the node currently selected in the page.',
          source: 'my-plugin:get-selection',
        },
      ],
    },
    results: {},
    pending: {},
  },
}

export const Empty: Story = {
  args: {
    functions: [],
    webmcp: { available: false, live: false, executable: false, tools: [] },
    results: {},
    pending: {},
  },
}
