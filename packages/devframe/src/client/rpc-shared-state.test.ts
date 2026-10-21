import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it } from 'vitest'
import { DEVFRAME_EVENTS } from '../events'
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

describe('initial shared-state snapshots', () => {
  function setup() {
    const { rpc, setCalls } = makeFakeRpc()
    const snapshot = Promise.withResolvers<object | undefined>()
    const handlers = new Map<string, (...args: any[]) => void>()
    rpc.isTrusted = true
    rpc.call = () => snapshot.promise
    rpc.client.register = (definition: any) => handlers.set(definition.name, definition.handler)
    const host = createRpcSharedStateClientHost(rpc)
    return { rpc, host, snapshot, handlers, setCalls }
  }

  it('reads a snapshot without writing it back to the node side', async () => {
    const { host, snapshot, setCalls } = setup()
    const state = await host.get('k', { initialValue: { count: 0, localDefault: true } })
    snapshot.resolve({ count: 1 })
    await snapshot.promise
    expect(state.value()).toEqual({ count: 1, localDefault: true })
    expect(setCalls).toEqual([])
    state.mutate((draft) => {
      draft.count = 2
    })
    expect(setCalls[0]?.[1]).toEqual({ count: 2, localDefault: true })
  })

  it('keeps an update received while the initial snapshot is pending', async () => {
    const { host, snapshot, handlers } = setup()
    const state = await host.get('k', { initialValue: { count: 0 } })
    handlers.get(DEVFRAME_EVENTS.broadcast.clientStateUpdated)!('k', { count: 2 }, 'newer')
    snapshot.resolve({ count: 1 })
    await snapshot.promise
    expect(state.value()).toEqual({ count: 2 })
  })

  it('keeps a local write made while the initial snapshot is pending', async () => {
    const { host, snapshot, setCalls } = setup()
    const state = await host.get('k', { initialValue: { count: 0 } })
    state.mutate((draft) => {
      draft.count = 2
    })
    snapshot.resolve({ count: 1 })
    await snapshot.promise
    expect(state.value()).toEqual({ count: 2 })
    expect(setCalls).toHaveLength(1)
  })

  it('forwards a local write triggered by the initial snapshot', async () => {
    const { host, snapshot, setCalls } = setup()
    const state = await host.get('k', { initialValue: { count: 0 } })
    state.on('updated', (value) => {
      if (value.count === 1) {
        state.mutate((draft) => {
          draft.count = 2
        })
      }
    })
    snapshot.resolve({ count: 1 })
    await snapshot.promise
    expect(state.value()).toEqual({ count: 2 })
    expect(setCalls).toHaveLength(1)
    expect(setCalls[0]?.[1]).toEqual({ count: 2 })
  })

  it('ignores a snapshot after its state is deleted', async () => {
    const { host, snapshot, setCalls } = setup()
    const state = await host.get('k', { initialValue: { count: 0 } })
    host.delete('k')
    snapshot.resolve({ count: 1 })
    await snapshot.promise
    expect(state.value()).toEqual({ count: 0 })
    expect(setCalls).toEqual([])
  })
})
