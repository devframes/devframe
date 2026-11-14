import type { DevframeMessageEntry, DevframeMessagesListDelta } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(async () => {
  const { dismissToast, useToasts } = await import('./toasts')
  for (const toast of [
    ...useToasts(),
  ]) dismissToast(toast.id)
  vi.restoreAllMocks()
  vi.resetModules()
  vi.useRealTimers()
})

async function fixture() {
  const { useMessages } = await import('./messages')
  const { useToasts } = await import('./toasts')
  let delta: DevframeMessagesListDelta = {
    entries: [],
    removedIds: [],
    version: 0,
    full: true,
  }
  let refresh = () => {}
  const call = vi.fn(async () => delta)
  // eslint-disable-next-line slop/no-chained-type-assertions -- Only the RPC feed participates in this state test.
  const state = useMessages({
    rpc: {
      call,
      isTrusted: true,
      ensureTrusted: async () => {},
      client: {
        register: (command: { handler: () => void }) => { refresh = command.handler },
      },
    },
  } as unknown as DocksContext)
  await vi.waitUntil(() => call.mock.calls.length === 1)
  await Promise.resolve()
  async function publish(next: DevframeMessagesListDelta) {
    delta = next
    const previousCalls = call.mock.calls.length
    refresh()
    await vi.waitUntil(() => call.mock.calls.length > previousCalls)
    await Promise.resolve()
  }
  const message: DevframeMessageEntry = {
    id: 'pending',
    message: 'Pending approval',
    level: 'info',
    from: 'browser',
    timestamp: 0,
    notify: true,
    autoDismiss: 60_000,
  }
  await publish({
    entries: [message],
    removedIds: [],
    version: 1,
    full: false,
  })
  return {
    state,
    call,
    toasts: useToasts(),
    publish,
    message,
  }
}

it.each([false, true])('removes visible toasts and timers when the message is removed (full=%s)', async (full) => {
  expect.assertions(5)
  const { state, toasts, publish } = await fixture()
  const clearTimer = vi.spyOn(globalThis, 'clearTimeout')
  expect(state.entries).toHaveLength(1)
  expect(toasts).toHaveLength(1)
  await publish({
    entries: [],
    removedIds: full
      ? []
      : ['pending'],
    version: 2,
    full,
  })
  expect(state.entries).toHaveLength(0)
  expect(toasts).toHaveLength(0)
  expect(clearTimer).toHaveBeenCalledOnce()
})

it('keeps surviving toasts and unread counts when receiving a full snapshot', async () => {
  expect.assertions(3)
  const { state, toasts, publish, message } = await fixture()
  await publish({
    entries: [message],
    removedIds: [],
    version: 2,
    full: true,
  })
  expect(state.entries).toHaveLength(1)
  expect(toasts).toHaveLength(1)
  expect(state.unreadCount).toBe(1)
})

it('passes the instance ID with the next cursor and replaces stale messages', async () => {
  const { state, call, publish, message } = await fixture()
  await publish({
    entries: [message],
    removedIds: [],
    version: 1,
    instanceId: 'old',
    full: true,
  })
  await publish({
    entries: [
      { ...message, id: 'new' },
    ],
    removedIds: [],
    version: 1,
    instanceId: 'new',
    full: true,
  })
  expect(call).toHaveBeenLastCalledWith('devframes:plugin:messages:list', 1, 'old')
  expect(state.entries.map(entry => entry.id)).toEqual(['new'])
  await publish({
    entries: [],
    removedIds: ['new'],
    version: 2,
    instanceId: 'new',
    full: false,
  })
  expect(call).toHaveBeenLastCalledWith('devframes:plugin:messages:list', 1, 'new')
  expect(state.entries).toEqual([])
})
