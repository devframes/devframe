import type { DevframeDockEntry } from '@devframes/hub'
import type { DevframeRpcClient } from '@devframes/hub/client'
import type { SharedState } from 'devframe/utils/shared-state'
import { createEventEmitter } from 'devframe/utils/events'
import { createSharedState } from 'devframe/utils/shared-state'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createDocksContext } from './context'

interface StubSharedState<Value extends object> extends SharedState<Value> {
  push: (value: Value) => void
}

function createStubSharedState<Value extends object>(initialValue: Value): StubSharedState<Value> {
  const state = createSharedState({ initialValue }) as StubSharedState<Value>
  state.push = value => state.mutate(() => value)
  return state
}

function createStubRpc() {
  const sharedStates = new Map<string, StubSharedState<any>>()
  // eslint-disable-next-line slop/no-chained-type-assertions -- integration test double implements only the RPC surface createDocksContext exercises
  const rpc = {
    isTrusted: true,
    status: 'connected',
    connectionError: null,
    connectionMeta: { backend: 'live', configs: {} },
    connection: {},
    events: createEventEmitter<any>(),
    sharedState: {
      async get(key: string, options?: { initialValue?: object }) {
        if (!sharedStates.has(key))
          sharedStates.set(key, createStubSharedState(options?.initialValue ?? {}))
        return sharedStates.get(key)!
      },
    },
    client: { register: vi.fn() },
    call: vi.fn(),
  } as unknown as DevframeRpcClient
  return { rpc, sharedStates }
}

declare global {
  // eslint-disable-next-line vars-on-top -- test hook called by the dynamically imported client module
  var __DEVFRAME_CLIENT_SCRIPT_ATTEMPT__: (() => void) | undefined
}

afterEach(() => {
  delete globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__
  vi.restoreAllMocks()
})

describe('dock client scripts', () => {
  it('retries setup on a later activation after it fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let attempts = 0
    globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__ = () => {
      attempts++
      if (attempts === 1)
        throw new Error('setup failed')
    }
    const { rpc, sharedStates } = createStubRpc()
    const context = await createDocksContext('embedded', rpc)
    const entry = {
      id: 'retry-client-script',
      type: 'iframe',
      title: 'Retry client script',
      icon: 'ph:play',
      url: '/retry',
      clientScript: {
        importFrom: 'data:text/javascript,export default () => globalThis.__DEVFRAME_CLIENT_SCRIPT_ATTEMPT__()',
      },
    } satisfies DevframeDockEntry

    sharedStates.get('devframe:docks')!.push([entry])
    await nextTick()

    await expect(context.docks.switchEntry(entry.id)).rejects.toThrow('setup failed')
    await context.docks.switchEntry(null)
    await expect(context.docks.switchEntry(entry.id)).resolves.toBe(true)
    expect(attempts).toBe(2)
  })
})
