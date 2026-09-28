import type { ChannelOptions } from 'birpc'
import type { RpcClientEvents } from 'devframe/client'
import type { DevframeRpcClientFunctions, DevframeRpcServerFunctions, RpcFunctionsHost } from 'devframe/types'
import type { MessagePort } from 'node:worker_threads'
import { MessageChannel } from 'node:worker_threads'
import { createHostContext } from 'devframe/node'
import { RpcFunctionsCollectorBase } from 'devframe/rpc'
import { createRpcClient } from 'devframe/rpc/client'
import { createRpcServer } from 'devframe/rpc/server'
import { createRpcSharedStateClientHost, createRpcSharedStateServerHost } from 'devframe/rpc/shared-state'
import { createEventEmitter } from 'devframe/utils/events'
import { structuredCloneDeserialize, structuredCloneSerialize } from 'devframe/utils/structured-clone'
import { expect, it } from 'vitest'
import { createContextRpcServer } from '../node/rpc-core'

/** JSON records also travel through transports that cannot clone native values. */
function channelFor(port: MessagePort): ChannelOptions {
  return {
    post: message => port.postMessage(message),
    on: (handler) => {
      port.on('message', handler)
    },
    off: (handler) => {
      port.off('message', handler)
    },
    serialize: value => JSON.stringify(structuredCloneSerialize(value)),
    deserialize: value => structuredCloneDeserialize(JSON.parse(value)),
  }
}

async function createStateServer(mode: string) {
  if (mode === 'node context') {
    const context = await createHostContext({
      cwd: process.cwd(),
      mode: 'dev',
      host: {
        mountStatic() {},
        resolveOrigin: () => 'http://localhost',
        getStorageDir: () => process.cwd(),
      },
    })
    const { rpcGroup } = createContextRpcServer({ context, auth: false })
    return { group: rpcGroup, sharedState: context.rpc.sharedState }
  }

  const collector = new RpcFunctionsCollectorBase<DevframeRpcServerFunctions, undefined>(undefined)
  const group = createRpcServer<DevframeRpcClientFunctions, DevframeRpcServerFunctions>(collector.functions)
  const broadcast: RpcFunctionsHost['broadcast'] = async (options) => {
    await Promise.all(group.clients
      .filter(client => options.filter?.(client) !== false)
      .map(client => client.$callRaw({ ...options, optional: true, event: true })))
  }
  const sharedState = createRpcSharedStateServerHost({ register: collector.register.bind(collector), broadcast })
  return { group, sharedState }
}

it.each(['custom channels', 'node context'])('shares state across %s with per-connection subscriptions', async (mode) => {
  expect.assertions(13)
  const { group, sharedState } = await createStateServer(mode)
  const counter = await sharedState.get('counter', { initialValue: { count: 1 } })
  const channels = [new MessageChannel(), new MessageChannel()]
  const peers = channels.map((channel, index) => {
    const meta = { id: index, subscribedStates: new Set<string>() }
    const serverChannel = { ...channelFor(channel.port1), meta }
    group.updateChannels(current => current.push(serverChannel))
    const client = new RpcFunctionsCollectorBase<DevframeRpcClientFunctions, undefined>(undefined)
    const rpc = createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(client.functions, {
      channel: channelFor(channel.port2),
    })
    const state = createRpcSharedStateClientHost({
      call: rpc.$call,
      callEvent: rpc.$callEvent,
      client,
      isTrusted: true,
      events: createEventEmitter<RpcClientEvents>(),
      connectionMeta: { backend: 'none' },
    })
    return { meta, rpc, state, serverChannel }
  })
  const [first, second] = peers
  try {
    const firstCounter = await first.state.get<{ count: number }>('counter')
    expect(firstCounter.value()).toEqual({ count: 1 })
    expect(first.meta.subscribedStates.has('counter')).toBe(true)
    expect(second.meta.subscribedStates.has('counter')).toBe(false)

    const secondCounter = await second.state.get<{ count: number }>('counter')
    expect(second.meta.subscribedStates.has('counter')).toBe(true)
    firstCounter.mutate((draft) => {
      draft.count = 2
    })
    await expect.poll(() => counter.value().count).toBe(2)
    await expect.poll(() => secondCounter.value().count).toBe(2)

    group.clients.find(client => client.$meta === first.meta)?.$close()
    group.updateChannels(current => current.splice(current.indexOf(first.serverChannel), 1))
    first.rpc.$close()
    await expect(first.rpc.$call('devframe:rpc:server-state:get', 'counter')).rejects.toThrow()
    secondCounter.mutate((draft) => {
      draft.count = 3
    })
    await expect.poll(() => counter.value().count).toBe(3)
    expect(firstCounter.value().count).toBe(2)
    expect(sharedState.keys()).toEqual(['counter'])
    expect(first.state.delete('counter')).toBe(true)
    expect(sharedState.delete('counter')).toBe(true)
    expect(sharedState.keys()).toEqual([])
  }
  finally {
    for (const peer of peers) peer.rpc.$close()
    for (const client of group.clients) client.$close()
    group.updateChannels(current => current.splice(0))
    for (const channel of channels) {
      channel.port1.close()
      channel.port2.close()
    }
  }
})

it('rejects an initial snapshot when its RPC connection closes', async () => {
  expect.assertions(1)
  const client = new RpcFunctionsCollectorBase<DevframeRpcClientFunctions, undefined>(undefined)
  const channel = new MessageChannel()
  const rpc = createRpcClient<DevframeRpcServerFunctions, DevframeRpcClientFunctions>(client.functions, {
    channel: channelFor(channel.port1),
  })
  const state = createRpcSharedStateClientHost({
    call: rpc.$call,
    callEvent: rpc.$callEvent,
    client,
    isTrusted: true,
    events: createEventEmitter<RpcClientEvents>(),
    connectionMeta: { backend: 'none' },
  })
  try {
    const pending = state.get('counter')
    rpc.$close()
    await expect(pending).rejects.toThrow('closed')
  }
  finally {
    channel.port1.close()
    channel.port2.close()
  }
}, 1000)
