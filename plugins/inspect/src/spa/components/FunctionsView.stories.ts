import type { Meta, StoryObj } from '@storybook/vue3'
import FunctionsView from './FunctionsView.vue'

const meta = {
  title: 'Inspector/FunctionsView',
  component: FunctionsView,
  tags: ['autodocs'],
  argTypes: {
    onInvoke: { action: 'invoked' },
  },
} satisfies Meta<typeof FunctionsView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    functions: [
      {
        name: 'devframes-plugin-inspect:list-functions',
        type: 'query',
        jsonSerializable: true,
        snapshot: true,
        cacheable: false,
        hasArgs: false,
        hasReturns: false,
        hasDump: false,
        hasSetup: true,
        hasHandler: true,
        invokable: true,
        agent: {
          description: 'List every RPC function registered on this devframe connection.',
          title: 'List RPC functions',
        },
      },
      {
        name: 'devframes-plugin-inspect:invoke',
        type: 'action',
        jsonSerializable: false,
        snapshot: false,
        cacheable: false,
        hasArgs: true,
        hasReturns: true,
        hasDump: false,
        hasSetup: true,
        hasHandler: true,
        invokable: false,
      },
      {
        name: 'vite:rolldown:list-sessions',
        type: 'query',
        jsonSerializable: true,
        snapshot: false,
        cacheable: false,
        hasArgs: false,
        hasReturns: true,
        hasDump: false,
        hasSetup: true,
        hasHandler: true,
        invokable: true,
      },
      {
        name: 'vite:rolldown:chunks/list',
        type: 'query',
        jsonSerializable: true,
        snapshot: false,
        cacheable: false,
        hasArgs: true,
        hasReturns: true,
        hasDump: false,
        hasSetup: true,
        hasHandler: true,
        invokable: true,
      },
      {
        name: 'app/routes:get',
        type: 'event',
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
    ],
    isStatic: false,
    results: {},
    pending: {},
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
      'devframes-plugin-inspect:list-functions': {
        ok: true,
        result: [{ name: 'dummy' }],
        durationMs: 42,
      },
      'devframes-plugin-inspect:invoke': {
        ok: false,
        error: { name: 'Error', message: 'Failed to invoke' },
        durationMs: 12,
      },
    },
    pending: {
      'vite:rolldown:list-sessions': true,
    },
  },
}
