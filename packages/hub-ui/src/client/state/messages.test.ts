import type { DevframeMessageEntry, DevframeMessagesListDelta } from '@devframes/hub'
import type { DocksContext } from '@devframes/hub/client'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.useRealTimers()
})

async function fixture() {
  const { useMessages } = await import('./messages')
  let delta: DevframeMessagesListDelta = {
    entries: [],
    removedIds: [],
    version: 0,
    full: true,
  }
  let refresh = () => {}
  const call = vi.fn(async () => delta)
  // eslint-disable-next-line slop/no-chained-type-assertions -- Only the RPC feed participates in this state test.
  const context = {
    rpc: {
      call,
      isTrusted: true,
      ensureTrusted: async () => {},
      client: {
        register: (command: { handler: () => void }) => { refresh = command.handler },
      },
    },
  } as unknown as DocksContext
  const state = useMessages(context)
  onTestFinished(() => {
    for (const toast of [...state.toasts.items])
      state.toasts.dismiss(toast.id)
  })
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
    context,
    call,
    toasts: state.toasts.items,
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

it('waits for trust without a deadline before the initial fetch', async () => {
  expect.assertions(3)
  const { useMessages } = await import('./messages')
  const trust = Promise.withResolvers<boolean>()
  const ensureTrusted = vi.fn(() => trust.promise)
  const call = vi.fn(async () => ({
    entries: [],
    removedIds: [],
    version: 0,
    full: true,
  }))
  // eslint-disable-next-line slop/no-chained-type-assertions -- Only the RPC trust gate and feed participate in this state test.
  useMessages({
    rpc: {
      call,
      isTrusted: false,
      ensureTrusted,
      client: {
        register: () => {},
      },
    },
  } as unknown as DocksContext)

  await Promise.resolve()
  expect(ensureTrusted).toHaveBeenCalledWith(0)
  expect(call).not.toHaveBeenCalled()

  trust.resolve(true)
  await vi.waitUntil(() => call.mock.calls.length === 1)
  expect(call).toHaveBeenCalledOnce()
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

it('keeps messages and toasts with their RPC client after a replacement', async () => {
  const first = await fixture()
  const second = await fixture()
  const { useMessages } = await import('./messages')
  expect(useMessages(second.context)).toBe(second.state)
  expect(second.state).not.toBe(first.state)
  await first.publish({
    entries: [
      { ...first.message, message: 'late update from the old connection' },
    ],
    removedIds: [],
    version: 2,
    full: false,
  })
  expect(second.state.entries).toEqual([second.message])
  expect(second.toasts.map(toast => toast.entry)).toEqual([second.message])
  first.state.toasts.dismiss(first.message.id)
  expect(second.toasts).toHaveLength(1)
})

it('rebuilds the feed in snapshot order and discards old notifications across instances', async () => {
  const { message, publish, state, toasts } = await fixture()
  const other = { ...message, id: 'other', notify: false }
  await publish({
    entries: [message, other],
    removedIds: [],
    version: 2,
    instanceId: 'first',
    full: true,
  })
  state.pendingSelectId = message.id
  await publish({
    entries: [
      other,
      { ...message, notify: false },
    ],
    removedIds: [],
    version: 2,
    instanceId: 'second',
    full: true,
  })
  expect(toasts).toEqual([])
  expect(state.entries.map(entry => entry.id)).toEqual(['other', message.id])
  expect(state.pendingSelectId).toBeNull()
  expect(state.unreadCount).toBe(2)
})
