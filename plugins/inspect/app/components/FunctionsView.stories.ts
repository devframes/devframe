import type { Meta, StoryObj } from '@storybook/vue3-vite'
import type { RpcFunctionInfo } from '../connect'
import { expect, fn, userEvent, within } from 'storybook/test'
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
        name: 'devframes:plugin:inspect:list-functions',
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
        name: 'devframes:plugin:inspect:invoke',
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
      'devframes:plugin:inspect:list-functions': {
        ok: true,
        result: [{ name: 'dummy' }],
        durationMs: 42,
      },
      'devframes:plugin:inspect:invoke': {
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

const query: RpcFunctionInfo = {
  name: 'audit:echo',
  type: 'query',
  jsonSerializable: true,
  snapshot: false,
  cacheable: false,
  hasArgs: true,
  hasReturns: false,
  hasDump: false,
  hasSetup: true,
  hasHandler: true,
  invokable: true,
}

export const InvalidArguments: Story = {
  args: {
    ...Default.args,
    functions: [query],
    onInvoke: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('echo'))
    const input = canvas.getByPlaceholderText('[]')
    const invoke = canvas.getByRole('button', { name: 'Invoke' })

    await userEvent.type(input, '{{')
    await userEvent.click(invoke)
    const error = canvas.getByRole('alert')
    await expect(error).toHaveTextContent('Invalid JSON arguments:')
    await expect(input).toHaveAttribute('aria-invalid', 'true')
    await expect(input).toHaveAttribute('aria-describedby', error.id)
    await expect(args.onInvoke).not.toHaveBeenCalled()

    await userEvent.clear(input)
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
    await expect(input).toHaveAttribute('aria-invalid', 'false')
    await userEvent.type(input, '[["recovered"]')
    await userEvent.click(invoke)
    await expect(args.onInvoke).toHaveBeenLastCalledWith(query, ['recovered'])

    await userEvent.clear(input)
    await userEvent.type(input, '42')
    await userEvent.click(invoke)
    await expect(args.onInvoke).toHaveBeenLastCalledWith(query, [42])
  },
}

export const InvalidArgumentsAfterSuccess: Story = {
  args: {
    ...InvalidArguments.args,
    results: {
      'audit:echo': { ok: true, result: 'previous result', durationMs: 1 },
    },
    onInvoke: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('echo'))
    const input = canvas.getByPlaceholderText('[]')
    await userEvent.type(input, '{{')
    await userEvent.click(canvas.getByRole('button', { name: 'Invoke' }))
    await expect(canvas.getByRole('alert')).toHaveTextContent('Invalid JSON arguments:')
    await expect(canvas.getByText('"previous result"')).toBeVisible()
    await expect(args.onInvoke).not.toHaveBeenCalled()
  },
}
