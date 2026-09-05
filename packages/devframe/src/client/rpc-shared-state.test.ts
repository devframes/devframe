import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it } from 'vitest'
import { createRpcSharedStateClientHost } from './rpc-shared-state'

function makeFakeRpc() {
  const events = createEventEmitter<any>()
  const setCalls: any[][] = []
  const rpc = {
    connectionMeta: { backend: 'websocket' },
    isTrusted: false,
    events,
    client: { register: () => {} },
    callEvent: (name: string, ...args: any[]) => {
      if (name === 'devframe:rpc:server-state:set')
        setCalls.push(args)
    },
    call: async () => undefined,
  } as any
  return { rpc, events, setCalls }
}

describe('client shared state', () => {
  it('does not forward unchanged writes to the RPC server', async () => {
    const { rpc, events, setCalls } = makeFakeRpc()
    const state = await createRpcSharedStateClientHost(rpc).get('k', { initialValue: { count: 1 } })
    events.emit('rpc:is-trusted:updated', true)

    state.mutate((draft) => {
      draft.count = 1
    })
    expect(setCalls).toHaveLength(0)
    state.mutate((draft) => {
      draft.count = 2
    })
    expect(setCalls).toHaveLength(1)
    expect(setCalls[0]?.[1]).toEqual({ count: 2 })
  })

  it('registers the server-sync bridge once across repeated trust flips', async () => {
    const { rpc, events, setCalls } = makeFakeRpc()
    const host = createRpcSharedStateClientHost(rpc)
    const state = await host.get('k', { initialValue: { a: 1 } })

    events.emit('rpc:is-trusted:updated', true)
    events.emit('rpc:is-trusted:updated', true) // second flip must not re-register

    state.mutate((d: any) => {
      d.a = 2
    })
    expect(setCalls).toHaveLength(1) // exactly one server-state:set, not two
  })
})
