import type { Meta, StoryObj } from '@storybook/svelte-vite'
import App from './App.svelte'

// A hermetic stand-in for the devframe RPC client so the panel renders without a
// live backend: shared state resolves to its initial value, `list` returns no
// sessions, and the stream never yields. Enough to exercise the real Svelte
// surface + `@antfu/design` chrome (nav, empty state) offline.
function mockRpc() {
  const state = (initial: unknown) =>
    Promise.resolve({ value: () => initial, on: () => () => {} })
  return {
    sharedState: {
      get: (_key: string, opts?: { initialValue?: unknown }) => state(opts?.initialValue ?? {}),
    },
    call: async (method: string) => (method.endsWith(':list') ? [] : undefined),
    streaming: {
      subscribe: () => ({
        [Symbol.asyncIterator]() {
          return { next: () => new Promise<never>(() => {}) }
        },
        cancel() {},
      }),
    },
  }
}

const meta = {
  title: 'Terminals/Panel',
  component: App,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

/** No sessions yet — the empty state with a "New terminal" affordance. */
export const Empty: Story = {
  args: { rpc: mockRpc(), autostart: false },
}
