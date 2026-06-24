import type { Meta, StoryObj } from '@storybook/vue3'
import AgentView from './AgentView.vue'

const meta = {
  title: 'Inspector/AgentView',
  component: AgentView,
  tags: ['autodocs'],
  argTypes: {
    onInvoke: { action: 'invoked' },
    onRead: { action: 'read' },
  },
} satisfies Meta<typeof AgentView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    manifest: {
      tools: [
        {
          id: 'tool1',
          kind: 'rpc',
          title: 'Tool 1',
          description: 'A sample tool',
          safety: 'read',
          tags: ['sample'],
          inputSchema: { type: 'object', properties: { foo: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { bar: { type: 'string' } } },
        },
        {
          id: 'tool2',
          kind: 'tool',
          title: 'Tool 2',
          description: 'A destructive tool',
          safety: 'destructive',
        },
      ],
      resources: [
        {
          id: 'res1',
          uri: 'devframe://resource/res1',
          name: 'Resource 1',
          description: 'A sample resource',
          mimeType: 'application/json',
        },
      ],
    },
    isStatic: false,
    results: {
      tool1: { ok: true, result: { bar: 'qux' }, durationMs: 15 },
      res1: { ok: false, error: { name: 'Error', message: 'Not found' }, durationMs: 2 },
    },
    pending: {
      tool2: true,
    },
  },
}

export const StaticMode: Story = {
  args: {
    ...Default.args,
    isStatic: true,
  },
}
