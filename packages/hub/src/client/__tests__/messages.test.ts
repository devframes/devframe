import { describe, expect, it } from 'vitest'
import { createMessagesClient } from '../messages'

function createStubRpc() {
  const calls: any[][] = []
  const rpc = {
    call: async (...args: any[]) => {
      calls.push(args)
      if (args[0] === 'hub:messages:add')
        return { id: 'msg-1', timestamp: 1, from: 'browser', ...args[1] }
      if (args[0] === 'hub:messages:update')
        return { id: args[1], timestamp: 1, from: 'browser', ...args[2] }
      return undefined
    },
  } as any
  return { rpc, calls }
}

describe('createMessagesClient', () => {
  it('merges defaults beneath the input; explicit input fields win', async () => {
    const { rpc, calls } = createStubRpc()
    const messages = createMessagesClient(rpc, { defaults: { category: 'my-entry' } })

    await messages.add({ message: 'hello', level: 'info' })
    expect(calls.at(-1)).toEqual(['hub:messages:add', { message: 'hello', level: 'info', category: 'my-entry' }])

    await messages.add({ message: 'custom', level: 'info', category: 'a11y' })
    expect(calls.at(-1)?.[1].category).toBe('a11y')
  })

  it('provides per-level shortcuts that delegate to add()', async () => {
    const { rpc, calls } = createStubRpc()
    const messages = createMessagesClient(rpc)

    const handle = await messages.info('hi')
    expect(calls.at(-1)).toEqual(['hub:messages:add', { message: 'hi', level: 'info' }])
    expect(handle.id).toBe('msg-1')

    await messages.error('boom', { notify: true })
    expect(calls.at(-1)).toEqual(['hub:messages:add', { message: 'boom', level: 'error', notify: true }])

    await handle.dismiss()
    expect(calls.at(-1)).toEqual(['hub:messages:remove', 'msg-1'])
  })
})
