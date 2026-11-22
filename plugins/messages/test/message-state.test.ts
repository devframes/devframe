import type { DevframeHubContext } from '@devframes/hub/node'
import type { DevframeRpcClient } from 'devframe/client'
import { DevframeMessagesHost } from '@devframes/hub/node'
import { expect, it, vi } from 'vitest'
import { useMessages } from '../app/client/state/messages'

it.each([1, 2, 3])('replaces cached messages after a trust refresh at new version %s', async (count) => {
  const previous = new DevframeMessagesHost({} as DevframeHubContext)
  await previous.info('old first', { id: 'old:1' })
  await previous.info('old second', { id: 'old:2' })
  let host = previous
  let trusted: (value: boolean) => void = () => {}
  const call = vi.fn(async (_name: string, since?: number | null, instanceId?: string | null) => host.listSince(since, instanceId))
  const rpc = {
    call,
    client: {
      definitions: new Map(),
      register: vi.fn(),
    },
    events: {
      on: (_name: string, handler: typeof trusted) => { trusted = handler },
    },
  }
  // eslint-disable-next-line slop/no-chained-type-assertions -- Only message reads and trust events participate in this test.
  const state = useMessages(rpc as unknown as DevframeRpcClient)
  await vi.waitFor(() => expect(state.entries.map(entry => entry.id)).toEqual(['old:1', 'old:2']))
  expect(call).toHaveBeenLastCalledWith('devframes:plugin:messages:list')
  const oldCursor = host.listSince()

  const current = new DevframeMessagesHost({} as DevframeHubContext)
  host = current
  for (let i = 0; i < count; i++)
    await host.info(`new ${i}`, { id: `new:${i}` })
  trusted(true)
  await vi.waitFor(() => expect(state.entries.map(entry => entry.id)).toEqual(Array.from({ length: count }, (_, i) => `new:${i}`)))
  expect(call).toHaveBeenLastCalledWith('devframes:plugin:messages:list', oldCursor.version, oldCursor.instanceId)

  const cursor = host.listSince()
  await host.remove('new:0')
  trusted(true)
  await vi.waitFor(() => expect(state.entries).toHaveLength(count - 1))
  expect(call).toHaveBeenLastCalledWith('devframes:plugin:messages:list', cursor.version, cursor.instanceId)
})
