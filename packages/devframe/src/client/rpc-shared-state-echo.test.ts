import type { DevframeNodeContext, DevframeRpcClientFunctions } from 'devframe/types'
import type { DevframeRpcClient, DevframeRpcContext, RpcClientEvents } from './rpc'
import assert from 'node:assert/strict'
import { RpcFunctionsCollectorBase } from 'devframe/rpc'
import { createEventEmitter } from 'devframe/utils/events'
import { createSharedState } from 'devframe/utils/shared-state'
import { expect, it, vi } from 'vitest'
import { RpcFunctionsHostImpl } from '../node/host-functions'
import { createRpcSharedStateClientHost } from './rpc-shared-state'

/** Delay only the transport writes; both endpoints retain their native shared-state logic. */
function connectSharedState() {
  const server = new RpcFunctionsHostImpl({} as DevframeNodeContext)
  const clientFunctions = new RpcFunctionsCollectorBase<DevframeRpcClientFunctions, DevframeRpcContext>({} as DevframeRpcContext)
  const pendingWrites: (() => Promise<void>)[] = []
  const pendingBroadcasts: Promise<void>[] = []
  const connection: Partial<DevframeRpcClient> = {
    connectionMeta: { backend: 'websocket' },
    isTrusted: true,
    events: createEventEmitter<RpcClientEvents>(),
    client: clientFunctions,
    call: async (method, ...parameters) => {
      assert.equal(method, 'devframe:rpc:server-state:get')
      const key = parameters[0]
      assert.ok(typeof key === 'string')
      return await server.invokeLocal('devframe:rpc:server-state:get', key)
    },
    callEvent: async (method, ...parameters) => {
      if (method === 'devframe:rpc:server-state:set') {
        pendingWrites.push(async () => {
          await Reflect.apply(server.invokeLocal, server, [method, ...parameters])
        })
      }
    },
  }
  const broadcast = vi.spyOn(server, 'broadcast').mockImplementation((options) => {
    const delivery = clientFunctions.getHandler(options.method).then(handler => Reflect.apply(handler, undefined, options.args))
    pendingBroadcasts.push(delivery)
    return delivery
  })
  async function flushBroadcasts() {
    await Promise.all(pendingBroadcasts.splice(0))
  }
  return {
    server,
    client: createRpcSharedStateClientHost(connection as DevframeRpcClient),
    dispose: () => broadcast.mockRestore(),
    flushBroadcasts,
    async flushWrites() {
      for (const write of pendingWrites.splice(0))
        await write()
      await flushBroadcasts()
    },
  }
}

for (const { name, enablePatches } of [
  { name: 'full snapshots', enablePatches: false },
  { name: 'patches', enablePatches: true },
]) {
  it(`does not echo ${name} into a replacement state while preserving local and nested writes`, async () => {
    expect.assertions(9)
    const connection = connectSharedState()
    try {
      const original = await connection.server.sharedState.get('counter', {
        sharedState: createSharedState({ initialValue: { count: 0 }, enablePatches }),
      })
      const initialClient = await connection.client.get<{ count: number }>('counter')
      expect(initialClient.value()).toEqual({ count: 0 })
      original.mutate((draft) => {
        draft.count = 5
      })
      await connection.flushBroadcasts()
      expect(initialClient.value()).toEqual({ count: 5 })

      connection.server.sharedState.delete('counter')
      connection.client.delete('counter')
      const replacement = await connection.server.sharedState.get('counter', {
        sharedState: createSharedState({ initialValue: { count: 6 }, enablePatches }),
      })
      const client = await connection.client.get<{ count: number }>('counter')
      expect(replacement.value()).toEqual({ count: 6 })
      await connection.flushWrites()
      expect(replacement.value()).toEqual({ count: 6 })
      expect(client.value()).toEqual({ count: 6 })

      client.mutate((draft) => {
        draft.count = 7
      })
      await connection.flushWrites()
      expect(replacement.value()).toEqual({ count: 7 })
      expect(client.value()).toEqual({ count: 7 })

      const stop = client.on('updated', (snapshot) => {
        if (snapshot.count !== 8)
          return
        stop()
        client.mutate((draft) => {
          draft.count = 9
        })
      })
      replacement.mutate((draft) => {
        draft.count = 8
      })
      await connection.flushBroadcasts()
      expect(client.value()).toEqual({ count: 9 })
      await connection.flushWrites()
      expect(replacement.value()).toEqual({ count: 9 })
    }
    finally {
      connection.dispose()
    }
  })
}

it('forwards a callback write to another state that reuses the received sync ID', async () => {
  expect.assertions(3)
  const connection = connectSharedState()
  try {
    const original = await connection.server.sharedState.get('source', { initialValue: { count: 0 } })
    const derived = await connection.server.sharedState.get('derived', { initialValue: { count: 0 } })
    const sourceClient = await connection.client.get<{ count: number }>('source')
    const derivedClient = await connection.client.get<{ count: number }>('derived')
    sourceClient.on('updated', (snapshot, _patches, syncId) => {
      derivedClient.mutate((draft) => {
        draft.count = snapshot.count
      }, syncId)
    })
    original.mutate((draft) => {
      draft.count = 5
    })
    await connection.flushBroadcasts()
    expect(derivedClient.value()).toEqual({ count: 5 })
    await connection.flushWrites()
    expect(derived.value()).toEqual({ count: 5 })
    expect(original.value()).toEqual({ count: 5 })
  }
  finally {
    connection.dispose()
  }
})
