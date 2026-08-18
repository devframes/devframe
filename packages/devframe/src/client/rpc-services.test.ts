import type { DevframeServicesState } from 'devframe/types'
import { createEventEmitter } from 'devframe/utils/events'
import { describe, expect, it } from 'vitest'
import { createDevframeServicesClient } from './rpc-services'
import { createRpcSharedStateClientHost } from './rpc-shared-state'

const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

function makeFakeRpc(serverState: DevframeServicesState) {
  const events = createEventEmitter<any>()
  const rpc = {
    connectionMeta: { backend: 'websocket' },
    isTrusted: true,
    events,
    client: { register: () => {} },
    callEvent: () => {},
    call: async (name: string, key: string) => {
      if (name === 'devframe:rpc:server-state:get' && key === 'devframe:services')
        return serverState
      return undefined
    },
    scope: (namespace: string) => ({ rpc: { namespace } }),
  } as any
  rpc.sharedState = createRpcSharedStateClientHost(rpc)
  return rpc
}

describe('client services', () => {
  it('mirrors the advertisement and exposes sync accessors', async () => {
    const rpc = makeFakeRpc({
      '@devframes/service-open': {
        package: '@devframes/service-open',
        version: '1.0.0',
        scope: 'devframes:service:open',
      },
    })
    const services = createDevframeServicesClient(rpc)

    // Before the snapshot lands the accessors read as empty, never throw.
    expect(services.has('@devframes/service-open')).toBe(false)
    expect(services.get('@devframes/service-open')).toBeUndefined()

    await services.state()
    await sleep()

    expect(services.has('@devframes/service-open')).toBe(true)
    expect(services.keys()).toEqual(['@devframes/service-open'])
    const handle = services.get('@devframes/service-open')!
    expect(handle.version).toBe('1.0.0')
    expect(handle.scope).toBe('devframes:service:open')
    // The RPC surface is scoped to the service's namespace.
    expect((handle.rpc as any).namespace).toBe('devframes:service:open')
    // Handles are stable across reads while the advertisement is unchanged.
    expect(services.get('@devframes/service-open')).toBe(handle)
  })

  it('tracks services appearing after the first snapshot', async () => {
    const rpc = makeFakeRpc({})
    const services = createDevframeServicesClient(rpc)
    const state = await services.state()
    await sleep()
    expect(services.has('@devframes/service-shiki')).toBe(false)

    state.mutate((value: any) => {
      value['@devframes/service-shiki'] = {
        package: '@devframes/service-shiki',
        version: '2.1.0',
        scope: 'devframes:service:shiki',
      }
    })
    expect(services.has('@devframes/service-shiki')).toBe(true)
    expect(services.get('@devframes/service-shiki')?.version).toBe('2.1.0')
  })
})
