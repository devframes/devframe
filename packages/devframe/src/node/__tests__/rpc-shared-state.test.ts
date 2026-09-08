import type { DevframeNodeContext } from 'devframe/types'
import { describe, expect, it, vi } from 'vitest'
import { RpcFunctionsHostImpl } from '../host-functions'

describe('node-side shared state', () => {
  it('broadcasts the first RPC snapshot and deduplicates later echoes', async () => {
    const rpc = new RpcFunctionsHostImpl({} as DevframeNodeContext)
    const broadcast = vi.spyOn(rpc, 'broadcast').mockResolvedValue()

    await rpc.invokeLocal('devframe:rpc:server-state:set', 'counter', { count: 1 }, 'first')
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenLastCalledWith({
      method: 'devframe:rpc:client-state:updated',
      args: ['counter', { count: 1 }, 'first'],
      filter: expect.any(Function),
    })

    const state = await rpc.sharedState.get<{ count: number }>('counter')
    await rpc.invokeLocal('devframe:rpc:server-state:set', 'counter', { count: 2 }, 'first')
    expect(state.value()).toEqual({ count: 1 })
    expect(broadcast).toHaveBeenCalledTimes(1)

    await rpc.invokeLocal('devframe:rpc:server-state:set', 'counter', { count: 2 }, 'second')
    expect(state.value()).toEqual({ count: 2 })
    expect(broadcast).toHaveBeenCalledTimes(2)

    state.mutate((draft) => {
      draft.count = 2
    })
    expect(broadcast).toHaveBeenCalledTimes(2)
  })
})
